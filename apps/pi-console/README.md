# Pi Console

The Pi Console is the Trust Substrate example control plane for local
multi-agent protocol runs. It is a client for agent sessions, receipts, task
state, delegation, and runtime activity; the receipt graph remains the source of
truth.

Each launched console agent keeps a separate control-plane session id and chat
state. When the Pi extension is wired to Surfpool, the bound agent identity and
task state determine which keypair signs and submits the Trust Substrate
transaction. The console should display those receipts and action artifacts; it
must not fabricate a Pi response or hidden fallback action.

## Development

Start the example:

```bash
pnpm --dir apps/pi-console dev
```

Open the app and press **Play local simulation**. The page will run a fresh
local simulation and only show data generated from that run. Prepared
control-plane sessions are still opt-in; they do not send launch briefs or model
requests automatically.

Use **Send launch brief** inside a session only when you intentionally want to
spend a model call for that agent.

## Verification

Run the focused example checks:

```bash
pnpm --dir apps/pi-console test
pnpm --dir apps/pi-console build
```

The production build writes a sanitized static `public/dashboard-data.json`
artifact for bundlers, but the Pi Console UI reads the local simulation endpoint
instead of falling back to that file.
