import * as anchor from "@anchor-lang/core";
import { assert } from "chai";

describe("surfpool_e2e", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("connects to the configured local Surfpool RPC endpoint", async () => {
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const expectedRpcEndpoint = process.env.ANCHOR_PROVIDER_URL;

    assert.ok(expectedRpcEndpoint, "ANCHOR_PROVIDER_URL must be set");
    assert.equal(provider.connection.rpcEndpoint, expectedRpcEndpoint);

    const version = await provider.connection.getVersion();
    assert.ok(version["solana-core"].length > 0);
  });
});
