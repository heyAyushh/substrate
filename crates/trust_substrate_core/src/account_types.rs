// Cyclic receipt_emitter consumers use this shared account view instead of
// hand-copying the ReceiptRecord layout into each program crate.
use anchor_lang::prelude::*;
use std::io::Write;

use crate::TrustSubstrateError;

const RECEIPT_EMITTER_PROGRAM_ID: Pubkey = pubkey!("FR2iXdHVBWbzkdn5qQdWEuyLWWaB2zR9ipRLTA8rGvJk");
const RECEIPT_RECORD_DISCRIMINATOR: [u8; 8] = [51, 97, 207, 106, 28, 85, 70, 40];

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
