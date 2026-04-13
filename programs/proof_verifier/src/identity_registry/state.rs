use anchor_lang::prelude::*;
use std::io::Write;
use trust_substrate_core::TrustSubstrateError;

const IDENTITY_REGISTRY_PROGRAM_ID: Pubkey =
    pubkey!("7eJnW2rVFi7e64YyUXviTeuYDJtEMMgRnQsZbV3r3FDv");
const AGENT_IDENTITY_DISCRIMINATOR: [u8; 8] = [11, 149, 31, 27, 186, 76, 241, 72];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct AgentIdentity {
    pub authority: Pubkey,
    pub agent_id: [u8; 32],
    pub policy_root: [u8; 32],
    pub history_root: [u8; 32],
    pub bump: u8,
}

impl AccountSerialize for AgentIdentity {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(Self::DISCRIMINATOR)?;
        self.serialize(writer).map_err(Into::into)
    }
}

impl AccountDeserialize for AgentIdentity {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let bytes = *buf;
        if bytes.len() < Self::DISCRIMINATOR.len()
            || &bytes[..Self::DISCRIMINATOR.len()] != Self::DISCRIMINATOR
        {
            return err!(TrustSubstrateError::IdentityAccountTypeMismatch);
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

impl Discriminator for AgentIdentity {
    const DISCRIMINATOR: &'static [u8] = &AGENT_IDENTITY_DISCRIMINATOR;
}

impl Owner for AgentIdentity {
    fn owner() -> Pubkey {
        IDENTITY_REGISTRY_PROGRAM_ID
    }
}
