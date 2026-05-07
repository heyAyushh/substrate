use crate::{state::CheckpointImporter, TrustSubstrateError};
use anchor_lang::prelude::*;
use trust_substrate_core::CHECKPOINT_IMPORTER_SEED;

pub fn handler(ctx: Context<InitializeCheckpointImporter>, authority: Pubkey) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.payer.key(),
        authority,
        TrustSubstrateError::CheckpointImportAuthorityMismatch
    );

    let checkpoint_importer = &mut ctx.accounts.checkpoint_importer;
    checkpoint_importer.authority = authority;
    checkpoint_importer.bump = ctx.bumps.checkpoint_importer;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeCheckpointImporter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + CheckpointImporter::INIT_SPACE,
        seeds = [CHECKPOINT_IMPORTER_SEED],
        bump
    )]
    pub checkpoint_importer: Account<'info, CheckpointImporter>,
    pub system_program: Program<'info, System>,
}
