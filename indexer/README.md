# Anvay indexer (Envio HyperIndex)

Indexes Anvay's contracts on Monad testnet through HyperSync:

| Contract | Events | Entities |
| --- | --- | --- |
| `ClaimLinkEscrow` `0xD458…2138` (live, Agora AUSD) and `0x607B…0cDa` (v1) | `Deposited`, `Claimed`, `Cancelled` | `Transfer`, `Account`, `Stats` |
| `InrRateFeed` `0x12cC…c60F` | `RateUpdated` (written by the Chainlink CRE workflow) | `RateUpdate` |

Each escrow numbers its transfers from 1, so a `Transfer` id is `<escrow>-<transferId>`, with `escrow` and `transferId` as fields. `Stats` has a `global` row plus one row per escrow address.

The app reads the GraphQL endpoint (`NEXT_PUBLIC_ENVIO_GRAPHQL_URL`) for the public `/stats` page and to find a passkey account's transfers. Without it, the app reads the contract directly.

## Run and test

Envio runs on Linux and macOS (use WSL on Windows) with Node 22+.

```bash
cp .env.example .env     # set ENVIO_API_TOKEN from https://envio.dev/app/api-tokens
npm install
npm test                 # simulated flows + a replay of real Monad testnet data
npm run dev              # local indexer + GraphQL (needs Docker)
```

## Hosted deployment

Deployed on Envio's hosted service from this repo: root directory `indexer`, config `config.yaml`, branch `main`. Every push to `main` creates a new deployment.

Example query:

```graphql
{
  Stats(where: { id: { _eq: "global" } }) { links collected volume senders recipients }
  Transfer(order_by: { createdAt: desc }, limit: 5) { escrow transferId amount status createdAt }
}
```
