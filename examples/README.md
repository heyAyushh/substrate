# Examples

These are example clients. They show how an app or agent runtime can use Trust
Substrate without becoming part of the protocol.

| Example                                                     | What it is                             | Setup                                                                          |
| ----------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| [`society/`](society)                                       | Browser demo entrypoint                | [`society/README.md`](society/README.md)                                       |
| [`pi-console/`](pi-console)                                 | Local Pi agent console                 | [`pi-console/README.md`](pi-console/README.md)                                 |
| [`multi_agent/`](multi_agent)                               | Society Board and Surfpool live world  | [`multi_agent/README.md`](multi_agent/README.md)                               |
| [`multi_agent/society-ui-app/`](multi_agent/society-ui-app) | React app served by the Society server | [`multi_agent/society-ui-app/README.md`](multi_agent/society-ui-app/README.md) |
| [`agent_loop/`](agent_loop)                                 | Local SDK and indexer walkthrough      | [`agent_loop/README.md`](agent_loop/README.md)                                 |

Run the full local demo from the repository root:

```bash
anchor build --ignore-keys
pnpm society:ui:build
pnpm pi-console:dev
```

Then follow [`society/README.md`](society/README.md) to start Surfpool, deploy
the programs into it, and run Society.
