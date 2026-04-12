pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("7eJnW2rVFi7e64YyUXviTeuYDJtEMMgRnQsZbV3r3FDv");

#[program]
pub mod identity_registry {
    use super::*;

    pub fn create_identity(
        ctx: Context<CreateIdentity>,
        agent_id: [u8; 32],
        policy_root: [u8; 32],
        history_root: [u8; 32],
    ) -> Result<()> {
        instructions::create_identity::handler(ctx, agent_id, policy_root, history_root)
    }
}
