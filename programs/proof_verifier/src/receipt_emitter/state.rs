use anchor_lang::prelude::*;
use std::io::Write;
use trust_substrate_core::TrustSubstrateError;

const RECEIPT_EMITTER_PROGRAM_ID: Pubkey = pubkey!("FV5Nsn3jHH8xxBP6m1N43NawgswmMkhZo72HGYJaJLHp");
const RECEIPT_RECORD_DISCRIMINATOR: [u8; 8] = [51, 97, 207, 106, 28, 85, 70, 40];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ReceiptRecord {
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
    pub round: u16,
    pub bump: u8,
}

impl AccountSerialize for ReceiptRecord {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for ReceiptRecord {
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

impl Discriminator for ReceiptRecord {
    const DISCRIMINATOR: &'static [u8] = &RECEIPT_RECORD_DISCRIMINATOR;
}

impl Owner for ReceiptRecord {
    fn owner() -> Pubkey {
        RECEIPT_EMITTER_PROGRAM_ID
    }
}
