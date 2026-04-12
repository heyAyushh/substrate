pub mod constants;
pub mod error;
pub mod instructions;
pub mod model;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("FG9pVEZe1srVF1zTF2WgYpT5VSxxy7om9i9SJj9rGq3n");

#[program]
pub mod trust_substrate {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }

    pub fn create_identity(
        ctx: Context<CreateIdentity>,
        agent_id: [u8; 32],
        policy_root: [u8; 32],
        history_root: [u8; 32],
    ) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.authority = ctx.accounts.authority.key();
        identity.agent_id = agent_id;
        identity.policy_root = policy_root;
        identity.history_root = history_root;
        identity.bump = ctx.bumps.identity;
        Ok(())
    }

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: [u8; 32],
        subtask_root: [u8; 32],
        subtask_count: u16,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );

        let task = &mut ctx.accounts.task;
        task.identity = ctx.accounts.identity.key();
        task.task_id = task_id;
        task.subtask_root = subtask_root;
        task.subtask_count = subtask_count;
        task.bump = ctx.bumps.task;
        Ok(())
    }

    pub fn emit_receipt(
        ctx: Context<EmitReceipt>,
        receipt_id: [u8; 32],
        kind: u8,
        sequence: u64,
        domain: [u8; 32],
        previous_receipt: [u8; 32],
        payload_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            is_valid_receipt_kind(kind),
            TrustSubstrateError::InvalidReceiptKind
        );
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );

        let receipt = &mut ctx.accounts.receipt;
        receipt.identity = ctx.accounts.identity.key();
        receipt.task = ctx.accounts.task.key();
        receipt.receipt_id = receipt_id;
        receipt.actor = ctx.accounts.authority.key();
        receipt.kind = kind;
        receipt.sequence = sequence;
        receipt.domain = domain;
        receipt.previous_receipt = previous_receipt;
        receipt.payload_hash = payload_hash;
        receipt.bump = ctx.bumps.receipt;

        emit!(ReceiptCommitted {
            identity: receipt.identity,
            task: receipt.task,
            receipt_id,
            actor: receipt.actor,
            kind,
            sequence,
            domain,
        });

        Ok(())
    }

    pub fn create_delegation(
        ctx: Context<CreateDelegation>,
        allowed_actions: u8,
        expires_at_slot: u64,
    ) -> Result<()> {
        require!(
            allowed_actions != EMPTY_SCOPE_BITMAP,
            TrustSubstrateError::EmptyDelegationScope
        );
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );

        let delegation = &mut ctx.accounts.delegation;
        delegation.identity = ctx.accounts.identity.key();
        delegation.delegate = ctx.accounts.delegate.key();
        delegation.allowed_actions = allowed_actions;
        delegation.expires_at_slot = expires_at_slot;
        delegation.revoked = false;
        delegation.bump = ctx.bumps.delegation;
        Ok(())
    }

    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );

        ctx.accounts.delegation.revoked = true;
        Ok(())
    }

    pub fn checkpoint_history(
        ctx: Context<CheckpointHistory>,
        epoch: u64,
        root: [u8; 32],
        leaf_count: u64,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );

        let checkpoint = &mut ctx.accounts.checkpoint;
        checkpoint.identity = ctx.accounts.identity.key();
        checkpoint.epoch = epoch;
        checkpoint.root = root;
        checkpoint.leaf_count = leaf_count;
        checkpoint.bump = ctx.bumps.checkpoint;
        Ok(())
    }

    pub fn create_reputation_domain(
        ctx: Context<CreateReputationDomain>,
        domain: [u8; 32],
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );

        let reputation = &mut ctx.accounts.reputation;
        reputation.identity = ctx.accounts.identity.key();
        reputation.domain = domain;
        reputation.completed = 0;
        reputation.disputed = 0;
        reputation.bump = ctx.bumps.reputation;
        Ok(())
    }

    pub fn apply_reputation_receipt(ctx: Context<ApplyReputationReceipt>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.identity.authority,
            ctx.accounts.authority.key(),
            TrustSubstrateError::InvalidAuthority
        );
        require_keys_eq!(
            ctx.accounts.receipt.identity,
            ctx.accounts.identity.key(),
            TrustSubstrateError::ReceiptIdentityMismatch
        );
        require!(
            ctx.accounts.reputation.domain == ctx.accounts.receipt.domain,
            TrustSubstrateError::ReputationDomainMismatch
        );

        match ctx.accounts.receipt.kind {
            COMPLETION_KIND => {
                ctx.accounts.reputation.completed = ctx
                    .accounts
                    .reputation
                    .completed
                    .saturating_add(COMPLETION_CREDIT);
            }
            DISPUTE_KIND => {
                ctx.accounts.reputation.disputed = ctx
                    .accounts
                    .reputation
                    .disputed
                    .saturating_add(DISPUTE_CREDIT);
            }
            _ => {}
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(agent_id: [u8; 32])]
pub struct CreateIdentity<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + AgentIdentity::INIT_SPACE,
        seeds = [IDENTITY_SEED, authority.key().as_ref(), agent_id.as_ref()],
        bump
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + TaskRecord::INIT_SPACE,
        seeds = [TASK_SEED, identity.key().as_ref(), task_id.as_ref()],
        bump
    )]
    pub task: Account<'info, TaskRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(receipt_id: [u8; 32])]
pub struct EmitReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(has_one = identity)]
    pub task: Account<'info, TaskRecord>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptRecord::INIT_SPACE,
        seeds = [RECEIPT_SEED, identity.key().as_ref(), task.key().as_ref(), receipt_id.as_ref()],
        bump
    )]
    pub receipt: Account<'info, ReceiptRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateDelegation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    /// CHECK: Delegates are recorded as public keys and do not need account data.
    pub delegate: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + DelegationRecord::INIT_SPACE,
        seeds = [DELEGATION_SEED, identity.key().as_ref(), delegate.key().as_ref()],
        bump
    )]
    pub delegation: Account<'info, DelegationRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeDelegation<'info> {
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        has_one = identity,
        seeds = [DELEGATION_SEED, identity.key().as_ref(), delegation.delegate.as_ref()],
        bump = delegation.bump
    )]
    pub delegation: Account<'info, DelegationRecord>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct CheckpointHistory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + HistoryCheckpoint::INIT_SPACE,
        seeds = [CHECKPOINT_SEED, identity.key().as_ref(), epoch.to_le_bytes().as_ref()],
        bump
    )]
    pub checkpoint: Account<'info, HistoryCheckpoint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(domain: [u8; 32])]
pub struct CreateReputationDomain<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReputationAccumulator::INIT_SPACE,
        seeds = [REPUTATION_SEED, identity.key().as_ref(), domain.as_ref()],
        bump
    )]
    pub reputation: Account<'info, ReputationAccumulator>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApplyReputationReceipt<'info> {
    pub authority: Signer<'info>,
    pub identity: Account<'info, AgentIdentity>,
    pub receipt: Account<'info, ReceiptRecord>,
    #[account(
        mut,
        has_one = identity,
        seeds = [REPUTATION_SEED, identity.key().as_ref(), reputation.domain.as_ref()],
        bump = reputation.bump
    )]
    pub reputation: Account<'info, ReputationAccumulator>,
}

#[event]
pub struct ReceiptCommitted {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub receipt_id: [u8; 32],
    pub actor: Pubkey,
    pub kind: u8,
    pub sequence: u64,
    pub domain: [u8; 32],
}

fn is_valid_receipt_kind(kind: u8) -> bool {
    matches!(
        kind,
        ASSIGNMENT_KIND | HANDOFF_KIND | COMPLETION_KIND | DISPUTE_KIND
    )
}
