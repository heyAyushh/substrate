// Cyclic receipt_emitter consumers use this shared account view instead of
// hand-copying the ReceiptRecord layout into each program crate.
use anchor_lang::prelude::*;
use std::io::Write;

use crate::{
    TrustSubstrateError, AGENT_STAKE_PROGRAM_ID, RECEIPT_EMITTER_PROGRAM_ID,
    TASK_REGISTRY_PROGRAM_ID,
};

const DISPUTE_RESOLVER_PROGRAM_ID: Pubkey = pubkey!("uJx2R2MHL7PEob6UPNz2DevGKpwd35fnKCrDQoavbtF");
const RECEIPT_RECORD_DISCRIMINATOR: [u8; 8] = [51, 97, 207, 106, 28, 85, 70, 40];
const TASK_RECORD_DISCRIMINATOR: [u8; 8] = [62, 42, 105, 214, 9, 85, 60, 158];
const STAKE_ACCOUNT_DISCRIMINATOR: [u8; 8] = [80, 158, 67, 124, 50, 189, 192, 255];
const TOKEN_STAKE_ACCOUNT_DISCRIMINATOR: [u8; 8] = [136, 175, 134, 48, 230, 48, 84, 43];
const DISPUTE_VERDICT_DISCRIMINATOR: [u8; 8] = [202, 89, 149, 208, 234, 11, 240, 144];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct ReceiptRecordAccount {
    pub identity: Pubkey,
    pub task: Pubkey,
    pub receipt_id: [u8; 32],
    pub actor: Pubkey,
    pub kind: u8,
    pub sequence: u64,
    pub domain: [u8; 32],
    pub previous_receipt: [u8; 32],
    pub payload_hash: [u8; 32],
    pub via_delegation: Pubkey,
    pub auditor_identity: Pubkey,
    pub target_receipt: Pubkey,
    pub challenge_receipt: Pubkey,
    pub deadline_slot: u64,
    pub round: u16,
    pub bump: u8,
}

impl AccountSerialize for ReceiptRecordAccount {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for ReceiptRecordAccount {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let bytes = *buf;
        if bytes.len() < Self::DISCRIMINATOR.len()
            || &bytes[..Self::DISCRIMINATOR.len()] != Self::DISCRIMINATOR
        {
            return err!(TrustSubstrateError::ReceiptAccountTypeMismatch);
        }

        let mut data = &bytes[Self::DISCRIMINATOR.len()..];
        let account = Self::try_deserialize_unchecked(&mut data)?;
        *buf = data;
        Ok(account)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl Discriminator for ReceiptRecordAccount {
    const DISCRIMINATOR: &'static [u8] = &RECEIPT_RECORD_DISCRIMINATOR;
}

impl Owner for ReceiptRecordAccount {
    fn owner() -> Pubkey {
        RECEIPT_EMITTER_PROGRAM_ID
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct TaskRecordAccount {
    pub identity: Pubkey,
    pub task_id: [u8; 32],
    pub domain: [u8; 32],
    pub subtask_root: [u8; 32],
    pub subtask_count: u16,
    pub status: u8,
    pub completed_count: u32,
    pub disputed_count: u32,
    pub resolved_count: u32,
    pub last_receipt: Pubkey,
    pub last_sequence: u64,
    pub bump: u8,
}

impl AccountSerialize for TaskRecordAccount {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for TaskRecordAccount {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let bytes = *buf;
        if bytes.len() < Self::DISCRIMINATOR.len()
            || &bytes[..Self::DISCRIMINATOR.len()] != Self::DISCRIMINATOR
        {
            return err!(TrustSubstrateError::IdentityTaskAuthorityMismatch);
        }

        let mut data = &bytes[Self::DISCRIMINATOR.len()..];
        let account = Self::try_deserialize_unchecked(&mut data)?;
        *buf = data;
        Ok(account)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl Discriminator for TaskRecordAccount {
    const DISCRIMINATOR: &'static [u8] = &TASK_RECORD_DISCRIMINATOR;
}

impl Owner for TaskRecordAccount {
    fn owner() -> Pubkey {
        TASK_REGISTRY_PROGRAM_ID
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct StakeAccountView {
    pub identity: Pubkey,
    pub owner: Pubkey,
    pub slash_authority: Pubkey,
    pub trust_mode: u8,
    pub amount: u64,
    pub pending_unstake_amount: u64,
    pub unstake_unlocks_at: u64,
    pub slashed_total: u64,
    pub bump: u8,
}

impl AccountSerialize for StakeAccountView {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for StakeAccountView {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let bytes = *buf;
        if bytes.len() < Self::DISCRIMINATOR.len()
            || &bytes[..Self::DISCRIMINATOR.len()] != Self::DISCRIMINATOR
        {
            return err!(TrustSubstrateError::ReputationStakeMismatch);
        }

        let mut data = &bytes[Self::DISCRIMINATOR.len()..];
        let account = Self::try_deserialize_unchecked(&mut data)?;
        *buf = data;
        Ok(account)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl Discriminator for StakeAccountView {
    const DISCRIMINATOR: &'static [u8] = &STAKE_ACCOUNT_DISCRIMINATOR;
}

impl Owner for StakeAccountView {
    fn owner() -> Pubkey {
        AGENT_STAKE_PROGRAM_ID
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct TokenStakeAccountView {
    pub identity: Pubkey,
    pub owner: Pubkey,
    pub slash_authority: Pubkey,
    pub trust_mode: u8,
    pub scope: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub pending_unstake_amount: u64,
    pub unstake_unlocks_at: u64,
    pub slashed_total: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl AccountSerialize for TokenStakeAccountView {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for TokenStakeAccountView {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let bytes = *buf;
        if bytes.len() < Self::DISCRIMINATOR.len()
            || &bytes[..Self::DISCRIMINATOR.len()] != Self::DISCRIMINATOR
        {
            return err!(TrustSubstrateError::IdentityStakeAuthorityMismatch);
        }

        let mut data = &bytes[Self::DISCRIMINATOR.len()..];
        let account = Self::try_deserialize_unchecked(&mut data)?;
        *buf = data;
        Ok(account)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl Discriminator for TokenStakeAccountView {
    const DISCRIMINATOR: &'static [u8] = &TOKEN_STAKE_ACCOUNT_DISCRIMINATOR;
}

impl Owner for TokenStakeAccountView {
    fn owner() -> Pubkey {
        AGENT_STAKE_PROGRAM_ID
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct DisputeVerdictAccount {
    pub dispute_receipt: Pubkey,
    pub target_identity: Pubkey,
    pub outcome: u8,
    pub slash_amount: u64,
    pub adjudicator: Pubkey,
    pub created_at_slot: u64,
    pub bump: u8,
    pub class: u8,
    pub stale_after_slot: u64,
}

impl AccountSerialize for DisputeVerdictAccount {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for DisputeVerdictAccount {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let bytes = *buf;
        if bytes.len() < Self::DISCRIMINATOR.len()
            || &bytes[..Self::DISCRIMINATOR.len()] != Self::DISCRIMINATOR
        {
            return err!(TrustSubstrateError::ReputationVerdictMismatch);
        }

        let mut data = &bytes[Self::DISCRIMINATOR.len()..];
        let account = Self::try_deserialize_unchecked(&mut data)?;
        *buf = data;
        Ok(account)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl Discriminator for DisputeVerdictAccount {
    const DISCRIMINATOR: &'static [u8] = &DISPUTE_VERDICT_DISCRIMINATOR;
}

impl Owner for DisputeVerdictAccount {
    fn owner() -> Pubkey {
        DISPUTE_RESOLVER_PROGRAM_ID
    }
}
