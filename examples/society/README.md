# Society Demo

Society is the browser demo for Trust Substrate. It runs a Surfpool-backed
world where agents have identities, stake, receipts, account links,
transaction links, and replayable evidence.

The current implementation lives in [`../multi_agent/`](../multi_agent). Use
that README for setup:

```bash
pnpm society:ui:build
. ./examples/multi_agent/society-demo-env.example.sh
SUBSTRATE_SOCIETY_PORT=4200 pnpm society
```

Open [http://127.0.0.1:4200/society](http://127.0.0.1:4200/society).
