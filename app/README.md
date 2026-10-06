# Anvay app

The Next.js app for Anvay. See the [main README](../README.md) for what it does, how it works and how to run it.

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

Tests:

- `bash scripts/api-e2e.sh`: `/api/faucet` and `/api/claim` against a local anvil fork of Monad testnet
- `npm run build && bash scripts/assistant-test.sh`: `/api/assistant` server logic against a fake Qwen
- `python scripts/assistant-live.py`: 12 real phrases against the running app and the configured Qwen model
