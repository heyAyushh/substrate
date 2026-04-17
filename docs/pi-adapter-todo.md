# Pi Adapter Todo

## Now

- [x] Keep Pi adapter events as the single bridge into receipts
- [x] Persist local index state in SQLite for simulation and pi-extension runs
- [x] Default pi-extension to the local SQLite index
- [x] Make simulation emit both JSON snapshot and SQLite DB path
- [x] Keep the Surfpool pi-extension harness green with the shared curator wallet
- [x] Re-run focused tests and the local simulation

## Later

- [ ] Add a richer SQL query surface if the dashboard needs direct table reads
- [ ] Add a Surfpool watcher that backfills the local DB from chain receipts
