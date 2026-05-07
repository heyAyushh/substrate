use crate::{
    state::{AppliedReputationReceipt, ReputationAccumulator},
    TrustSubstrateError,
};
use anchor_lang::prelude::*;
use attester_registry::state::AttesterRecord;
use identity_registry::state::{AgentIdentity, IdentityBond, RuntimeAttestation};
use trust_substrate_core::{
    DisputeVerdictAccount, ReceiptRecordAccount, StakeAccountView, TokenStakeAccountView,
};
use trust_substrate_core::{
    AGENT_LOST_OUTCOME, ATTESTATION_KIND, ATTESTER_RECORD_SEED, COMPLETION_KIND, DISPUTE_KIND,
    DISPUTE_RESOLVED_KIND, IDENTITY_BOND_SEED, IDENTITY_TIER_BONDED,
    MAX_REVIEWER_REPUTATION_WEIGHT, MAX_SLASH_REPUTATION_PENALTY, MAX_STAKE_REPUTATION_WEIGHT,
    REPUTATION_RECEIPT_APPLICATION_SEED, RUNTIME_ATTESTATION_SEED, SLASH_WEIGHT_UNIT_LAMPORTS,
    STAKE_SEED, STAKE_WEIGHT_UNIT_LAMPORTS, TOKEN_STAKE_SEED, VERDICT_CLASS_SAFETY, VERDICT_SEED,
};

#[derive(Clone, Copy)]
struct SourceIdentity {
    key: Pubkey,
    tier: u8,
    active_stake: bool,
}

#[derive(Default)]
struct ReputationEvidence {
    has_bond: bool,
    attester_tier: Option<u8>,
    stake_lamports: Option<u64>,
    slashed_lamports: Option<u64>,
    has_runtime_attestation: bool,
}

struct ResolutionEvidence {
    outcome: u8,
    skip_keys: Vec<Pubkey>,
}

fn require_negative_verdict(
    ctx: &Context<ApplyReputationReceipt>,
    dispute_receipt: Pubkey,
    target_identity: Pubkey,
) -> Result<DisputeVerdictAccount> {
    let (verdict, _) = load_dispute_verdict(ctx, dispute_receipt, target_identity)?;
    require!(
        verdict.outcome == AGENT_LOST_OUTCOME,
        TrustSubstrateError::ReputationVerdictOutcomeNotNegative
    );

    Ok(verdict)
}

fn load_dispute_verdict(
    ctx: &Context<ApplyReputationReceipt>,
    dispute_receipt: Pubkey,
    target_identity: Pubkey,
) -> Result<(DisputeVerdictAccount, Pubkey)> {
    let expected_verdict = Pubkey::find_program_address(
        &[VERDICT_SEED, dispute_receipt.as_ref()],
        &DisputeVerdictAccount::owner(),
    )
    .0;
    let verdict_info = ctx
        .remaining_accounts
        .iter()
        .find(|account| account.key() == expected_verdict)
        .ok_or_else(|| error!(TrustSubstrateError::ReputationVerdictMissing))?;
    let verdict = validate_dispute_verdict(verdict_info, dispute_receipt, target_identity)?;
    Ok((verdict, expected_verdict))
}

fn validate_dispute_verdict(
    verdict_info: &AccountInfo<'_>,
    dispute_receipt: Pubkey,
    target_identity: Pubkey,
) -> Result<DisputeVerdictAccount> {
    let expected_verdict = Pubkey::find_program_address(
        &[VERDICT_SEED, dispute_receipt.as_ref()],
        &DisputeVerdictAccount::owner(),
    )
    .0;
    require_keys_eq!(
        *verdict_info.key,
        expected_verdict,
        TrustSubstrateError::ReputationVerdictMismatch
    );
    require_keys_eq!(
        *verdict_info.owner,
        DisputeVerdictAccount::owner(),
        TrustSubstrateError::ReputationVerdictMismatch
    );
    let verdict_data = verdict_info.try_borrow_data()?;
    let mut data_slice: &[u8] = &verdict_data;
    let verdict = DisputeVerdictAccount::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationVerdictMismatch))?;
    require_keys_eq!(
        verdict.dispute_receipt,
        dispute_receipt,
        TrustSubstrateError::ReputationVerdictMismatch
    );
    require_keys_eq!(
        verdict.target_identity,
        target_identity,
        TrustSubstrateError::ReputationVerdictMismatch
    );
    if verdict.class != VERDICT_CLASS_SAFETY {
        require!(
            verdict.stale_after_slot > 0,
            TrustSubstrateError::VerdictStaleWindowMissing
        );
        require!(
            Clock::get()?.slot <= verdict.stale_after_slot,
            TrustSubstrateError::VerdictStale
        );
    }

    Ok(verdict)
}

fn collect_resolution_evidence(
    ctx: &Context<ApplyReputationReceipt>,
) -> Result<Option<ResolutionEvidence>> {
    if ctx.accounts.receipt.kind != DISPUTE_RESOLVED_KIND {
        return Ok(None);
    }

    let dispute_receipt_key = Pubkey::new_from_array(ctx.accounts.receipt.previous_receipt);
    require_keys_neq!(
        dispute_receipt_key,
        Pubkey::default(),
        TrustSubstrateError::ReputationDisputeRequiredForResolution
    );
    let dispute_info = ctx
        .remaining_accounts
        .iter()
        .find(|account| account.key() == dispute_receipt_key)
        .ok_or_else(|| error!(TrustSubstrateError::ReputationDisputeRequiredForResolution))?;
    require_keys_eq!(
        *dispute_info.owner,
        ReceiptRecordAccount::owner(),
        TrustSubstrateError::ReputationDisputeRequiredForResolution
    );
    let dispute_data = dispute_info.try_borrow_data()?;
    let mut data_slice: &[u8] = &dispute_data;
    let dispute_receipt = ReceiptRecordAccount::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationDisputeRequiredForResolution))?;
    require!(
        dispute_receipt.kind == DISPUTE_KIND,
        TrustSubstrateError::ReputationDisputeRequiredForResolution
    );
    require_keys_eq!(
        dispute_receipt.identity,
        ctx.accounts.receipt.identity,
        TrustSubstrateError::ReputationDisputeRequiredForResolution
    );
    require_keys_eq!(
        dispute_receipt.task,
        ctx.accounts.receipt.task,
        TrustSubstrateError::ReputationDisputeRequiredForResolution
    );
    require!(
        dispute_receipt.domain == ctx.accounts.receipt.domain,
        TrustSubstrateError::ReputationDisputeRequiredForResolution
    );

    let (verdict, verdict_key) =
        load_dispute_verdict(ctx, dispute_receipt_key, ctx.accounts.identity.key())?;

    Ok(Some(ResolutionEvidence {
        outcome: verdict.outcome,
        skip_keys: vec![dispute_receipt_key, verdict_key],
    }))
}

fn evidence_source_key(receipt: &ReceiptRecordAccount) -> Pubkey {
    if receipt.auditor_identity != Pubkey::default() {
        receipt.auditor_identity
    } else {
        receipt.identity
    }
}

fn receipt_requires_reviewer_evidence(receipt: &ReceiptRecordAccount) -> bool {
    receipt.auditor_identity != Pubkey::default()
        && matches!(receipt.kind, DISPUTE_KIND | ATTESTATION_KIND)
}

fn source_identity_from_target(identity: &Account<'_, AgentIdentity>) -> SourceIdentity {
    SourceIdentity {
        key: identity.key(),
        tier: identity.tier,
        active_stake: identity.active_stake,
    }
}

fn load_source_identity<'info>(
    ctx: &Context<'info, ApplyReputationReceipt<'info>>,
    source_key: Pubkey,
) -> Result<SourceIdentity> {
    if source_key == ctx.accounts.identity.key() {
        return Ok(source_identity_from_target(&ctx.accounts.identity));
    }

    let source_info = ctx
        .remaining_accounts
        .iter()
        .find(|account| account.key() == source_key)
        .ok_or_else(|| error!(TrustSubstrateError::ReputationReviewerEvidenceMissing))?;
    require_keys_eq!(
        *source_info.owner,
        identity_registry::ID,
        TrustSubstrateError::ReputationEvidenceMismatch
    );
    let source_identity = deserialize_agent_identity(source_info)?;
    Ok(SourceIdentity {
        key: source_key,
        tier: source_identity.tier,
        active_stake: source_identity.active_stake,
    })
}

fn collect_reputation_evidence<'info>(
    ctx: &Context<'info, ApplyReputationReceipt<'info>>,
    source: SourceIdentity,
    skip_keys: &[Pubkey],
) -> Result<ReputationEvidence> {
    let mut evidence = ReputationEvidence::default();
    let expected_bond = Pubkey::find_program_address(
        &[IDENTITY_BOND_SEED, source.key.as_ref()],
        &identity_registry::ID,
    )
    .0;
    let expected_attester = Pubkey::find_program_address(
        &[ATTESTER_RECORD_SEED, source.key.as_ref()],
        &attester_registry::ID,
    )
    .0;
    let expected_stake = Pubkey::find_program_address(
        &[STAKE_SEED, source.key.as_ref()],
        &StakeAccountView::owner(),
    )
    .0;
    let expected_verdict = Pubkey::find_program_address(
        &[VERDICT_SEED, ctx.accounts.receipt.key().as_ref()],
        &DisputeVerdictAccount::owner(),
    )
    .0;

    for account in ctx.remaining_accounts.iter() {
        if account.key() == source.key
            || account.key() == expected_verdict
            || skip_keys.contains(&account.key())
        {
            continue;
        }
        if account.key() == expected_bond {
            evidence.has_bond = validate_identity_bond(account, source.key)?;
            continue;
        }
        if account.key() == expected_attester {
            evidence.attester_tier = Some(validate_attester(account, source.key)?);
            continue;
        }
        if account.key() == expected_stake {
            let stake = validate_stake(account, source.key)?;
            add_stake_evidence(&mut evidence, stake);
            continue;
        }
        if *account.owner == StakeAccountView::owner() {
            let stake = validate_token_stake(account, source.key)?;
            add_stake_evidence(&mut evidence, stake);
            continue;
        }
        if *account.owner == identity_registry::ID {
            evidence.has_runtime_attestation = validate_runtime_attestation(account, source.key)?;
            continue;
        }
        return err!(TrustSubstrateError::ReputationEvidenceMismatch);
    }

    Ok(evidence)
}

fn add_stake_evidence(evidence: &mut ReputationEvidence, stake: (u64, u64)) {
    evidence.stake_lamports = Some(evidence.stake_lamports.unwrap_or(0).saturating_add(stake.0));
    evidence.slashed_lamports = Some(
        evidence
            .slashed_lamports
            .unwrap_or(0)
            .saturating_add(stake.1),
    );
}

fn reviewer_weight(source: SourceIdentity, evidence: &ReputationEvidence) -> (u64, u64) {
    let bond_bonus = if source.tier >= IDENTITY_TIER_BONDED || evidence.has_bond {
        1
    } else {
        0
    };
    let attester_bonus = u64::from(evidence.attester_tier.unwrap_or(0));
    let stake_bonus = evidence
        .stake_lamports
        .filter(|_| source.active_stake)
        .map(|lamports| (lamports / STAKE_WEIGHT_UNIT_LAMPORTS).min(MAX_STAKE_REPUTATION_WEIGHT))
        .unwrap_or(0);
    let runtime_bonus = u64::from(evidence.has_runtime_attestation);
    let slash_penalty = evidence
        .slashed_lamports
        .map(|lamports| (lamports / SLASH_WEIGHT_UNIT_LAMPORTS).min(MAX_SLASH_REPUTATION_PENALTY))
        .unwrap_or(0);
    let raw_weight = 1u64
        .saturating_add(bond_bonus)
        .saturating_add(attester_bonus)
        .saturating_add(stake_bonus)
        .saturating_add(runtime_bonus)
        .saturating_sub(slash_penalty);

    (
        raw_weight.min(MAX_REVIEWER_REPUTATION_WEIGHT),
        slash_penalty,
    )
}

fn deserialize_agent_identity(account: &AccountInfo<'_>) -> Result<AgentIdentity> {
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    AgentIdentity::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationEvidenceMismatch))
}

fn validate_identity_bond(account: &AccountInfo<'_>, source_key: Pubkey) -> Result<bool> {
    require_keys_eq!(
        *account.owner,
        identity_registry::ID,
        TrustSubstrateError::IdentityBondRequired
    );
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let bond = IdentityBond::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::IdentityBondRequired))?;
    require_keys_eq!(
        bond.identity,
        source_key,
        TrustSubstrateError::IdentityBondRequired
    );
    Ok(true)
}

fn validate_attester(account: &AccountInfo<'_>, source_key: Pubkey) -> Result<u8> {
    require_keys_eq!(
        *account.owner,
        attester_registry::ID,
        TrustSubstrateError::ReputationAttesterMismatch
    );
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let attester = AttesterRecord::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationAttesterMismatch))?;
    require_keys_eq!(
        attester.identity,
        source_key,
        TrustSubstrateError::ReputationAttesterMismatch
    );
    Ok(attester.effective_tier)
}

fn validate_runtime_attestation(account: &AccountInfo<'_>, source_key: Pubkey) -> Result<bool> {
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let attestation = RuntimeAttestation::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationRuntimeAttestationMismatch))?;
    require_keys_eq!(
        attestation.identity,
        source_key,
        TrustSubstrateError::ReputationRuntimeAttestationMismatch
    );
    let expected = Pubkey::find_program_address(
        &[
            RUNTIME_ATTESTATION_SEED,
            source_key.as_ref(),
            attestation.runtime_commit.as_ref(),
        ],
        &identity_registry::ID,
    )
    .0;
    require_keys_eq!(
        account.key(),
        expected,
        TrustSubstrateError::ReputationRuntimeAttestationMismatch
    );
    Ok(true)
}

fn validate_stake(account: &AccountInfo<'_>, source_key: Pubkey) -> Result<(u64, u64)> {
    require_keys_eq!(
        *account.owner,
        StakeAccountView::owner(),
        TrustSubstrateError::ReputationStakeMismatch
    );
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let stake = StakeAccountView::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationStakeMismatch))?;
    require_keys_eq!(
        stake.identity,
        source_key,
        TrustSubstrateError::ReputationStakeMismatch
    );
    Ok((stake.amount, stake.slashed_total))
}

fn validate_token_stake(account: &AccountInfo<'_>, source_key: Pubkey) -> Result<(u64, u64)> {
    require_keys_eq!(
        *account.owner,
        TokenStakeAccountView::owner(),
        TrustSubstrateError::ReputationStakeMismatch
    );
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let stake = TokenStakeAccountView::try_deserialize(&mut data_slice)
        .map_err(|_| error!(TrustSubstrateError::ReputationStakeMismatch))?;
    require_keys_eq!(
        stake.identity,
        source_key,
        TrustSubstrateError::ReputationStakeMismatch
    );
    let expected = Pubkey::find_program_address(
        &[
            TOKEN_STAKE_SEED,
            source_key.as_ref(),
            stake.scope.as_ref(),
            stake.mint.as_ref(),
        ],
        &TokenStakeAccountView::owner(),
    )
    .0;
    require_keys_eq!(
        account.key(),
        expected,
        TrustSubstrateError::ReputationStakeMismatch
    );
    Ok((stake.amount, stake.slashed_total))
}

pub fn handler<'info>(ctx: Context<'info, ApplyReputationReceipt<'info>>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.receipt.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReceiptIdentityMismatch
    );
    require_keys_eq!(
        ctx.accounts.reputation.identity,
        ctx.accounts.identity.key(),
        TrustSubstrateError::ReputationIdentityMismatch
    );
    require!(
        ctx.accounts.reputation.domain == ctx.accounts.receipt.domain,
        TrustSubstrateError::ReputationDomainMismatch
    );
    require_keys_eq!(
        ctx.accounts.receipt_application.receipt,
        Pubkey::default(),
        TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    );

    if ctx.accounts.receipt.kind == DISPUTE_KIND {
        require_negative_verdict(
            &ctx,
            ctx.accounts.receipt.key(),
            ctx.accounts.identity.key(),
        )?;
    }
    let resolution_evidence = collect_resolution_evidence(&ctx)?;

    let source_key = evidence_source_key(&ctx.accounts.receipt);
    let source_identity = load_source_identity(&ctx, source_key)?;
    let skip_keys = resolution_evidence
        .as_ref()
        .map(|resolution| resolution.skip_keys.as_slice())
        .unwrap_or(&[]);
    let evidence = collect_reputation_evidence(&ctx, source_identity, skip_keys)?;
    if source_identity.active_stake {
        require!(
            evidence.stake_lamports.is_some(),
            TrustSubstrateError::ReputationStakeEvidenceMissing
        );
    }
    if receipt_requires_reviewer_evidence(&ctx.accounts.receipt) {
        require!(
            evidence.has_bond && evidence.attester_tier.is_some(),
            TrustSubstrateError::ReputationReviewerEvidenceMissing
        );
    }
    let (weight, slash_penalty) = reviewer_weight(source_identity, &evidence);
    require!(
        weight > 0,
        TrustSubstrateError::ReputationReviewerWeightZero
    );
    let weighted_completion = ctx
        .accounts
        .reputation
        .completion_weight
        .saturating_mul(weight);
    let weighted_dispute = ctx
        .accounts
        .reputation
        .dispute_weight
        .saturating_mul(weight);
    let weighted_resolution = ctx
        .accounts
        .reputation
        .dispute_resolved_weight
        .saturating_mul(weight);

    let reputation = &mut ctx.accounts.reputation;
    let mut applied_score_effect = true;
    match ctx.accounts.receipt.kind {
        COMPLETION_KIND => {
            reputation.completed = reputation.completed.saturating_add(1);
            reputation.weighted_completed = reputation
                .weighted_completed
                .saturating_add(weighted_completion);
        }
        DISPUTE_KIND => {
            reputation.disputed = reputation.disputed.saturating_add(1);
            reputation.weighted_disputed = reputation
                .weighted_disputed
                .saturating_add(weighted_dispute);
        }
        DISPUTE_RESOLVED_KIND => {
            let resolution = resolution_evidence.as_ref().ok_or_else(|| {
                error!(TrustSubstrateError::ReputationDisputeRequiredForResolution)
            })?;
            if resolution.outcome == AGENT_LOST_OUTCOME {
                applied_score_effect = false;
            } else {
                reputation.resolved = reputation.resolved.saturating_add(1);
                reputation.weighted_resolved = reputation
                    .weighted_resolved
                    .saturating_add(weighted_resolution);
            }
        }
        ATTESTATION_KIND => {
            reputation.attested = reputation.attested.saturating_add(1);
            reputation.weighted_attested = reputation.weighted_attested.saturating_add(weight);
        }
        _ => return err!(TrustSubstrateError::ReceiptKindNotAppliedToReputation),
    }
    if applied_score_effect {
        reputation.reviewer_weight_sum = reputation.reviewer_weight_sum.saturating_add(weight);
        reputation.slash_penalty_sum = reputation.slash_penalty_sum.saturating_add(slash_penalty);
    }
    reputation.last_applied_slot = Clock::get()?.slot;

    let receipt_application = &mut ctx.accounts.receipt_application;
    receipt_application.reputation = reputation.key();
    receipt_application.receipt = ctx.accounts.receipt.key();
    receipt_application.bump = ctx.bumps.receipt_application;

    Ok(())
}

pub fn already_applied_handler(ctx: Context<ReputationReceiptAlreadyApplied>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.receipt_application.reputation,
        ctx.accounts.reputation.key(),
        TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    );
    require_keys_eq!(
        ctx.accounts.receipt_application.receipt,
        ctx.accounts.receipt.key(),
        TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    );
    Ok(())
}

#[derive(Accounts)]
pub struct ApplyReputationReceipt<'info> {
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub receipt: Account<'info, ReceiptRecordAccount>,
    #[account(mut, constraint = reputation.identity == identity.key() @ TrustSubstrateError::ReputationIdentityMismatch)]
    pub reputation: Account<'info, ReputationAccumulator>,
    #[account(
        init,
        payer = authority,
        space = 8 + AppliedReputationReceipt::INIT_SPACE,
        seeds = [
            REPUTATION_RECEIPT_APPLICATION_SEED,
            reputation.key().as_ref(),
            receipt.key().as_ref()
        ],
        bump
    )]
    pub receipt_application: Account<'info, AppliedReputationReceipt>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReputationReceiptAlreadyApplied<'info> {
    pub identity: Account<'info, AgentIdentity>,
    pub authority: Signer<'info>,
    pub receipt: Account<'info, ReceiptRecordAccount>,
    #[account(constraint = reputation.identity == identity.key() @ TrustSubstrateError::ReputationIdentityMismatch)]
    pub reputation: Account<'info, ReputationAccumulator>,
    #[account(
        seeds = [
            REPUTATION_RECEIPT_APPLICATION_SEED,
            reputation.key().as_ref(),
            receipt.key().as_ref()
        ],
        bump = receipt_application.bump,
        has_one = reputation @ TrustSubstrateError::ReceiptAlreadyAppliedToReputation,
        has_one = receipt @ TrustSubstrateError::ReceiptAlreadyAppliedToReputation
    )]
    pub receipt_application: Account<'info, AppliedReputationReceipt>,
}
