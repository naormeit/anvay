# Anvay

**Send dollars home with a link.** Type an amount, share the link on WhatsApp, and your family taps to collect it in seconds. No bank details, no app to install, and almost no fees.

Built on [Monad](https://monad.xyz) for the Metropolis hackathon (Track 2: Consumer Products & Payments).

- **Live app:** https://anvay-pay.vercel.app (testnet; use "Add $100 test dollars" to try it). It installs as a mobile app: "Install Anvay" on Android, or Share → Add to Home Screen on iPhone.
- **Network:** Monad testnet (chain 10143). The same contracts are tested against Agora's real AUSD on a mainnet fork (see [Mainnet readiness](#mainnet-readiness)).

## Why

India receives more remittances than any other country. Sending money home today means bank forms, transfer fees, poor exchange rates and waits of hours or days. Anvay makes it as simple as sending a message:

1. **Sign in** with a passkey (fingerprint, face or screen lock), Google or email. Anvay creates the account in the background. No seed phrases and no crypto words anywhere in the app.
2. **Create a link** for any amount in dollars or rupees, or just type *"Send ₹5,000 to Mom"* or *"Papa ko 2 hazaar bhej do"*.
3. **Share it** on WhatsApp. The recipient opens it, signs in with a passkey, Google or email, and taps **Collect**. They need no gas, no wallet and no app.

Unclaimed money can be cancelled and returned at any time.

## How it works

```
 Sender's browser                         Monad                          Recipient's browser
 ─────────────────                        ─────                          ───────────────────
 1. generate one-time link key  ──►  ClaimLinkEscrow.deposit(amount,      4. open link (key is in the
 2. approve + deposit AUSD           claimKey = address(linkKey), expiry)    #fragment, never sent to
 3. share  /claim#t=<id>&k=<key>                                              any server)
                                                                           5. link key signs EIP-712
                                     ClaimLinkEscrow.claim(id, recipient,     Claim(id, recipient)
                                       sig)  ◄──  /api/claim relayer  ◄──  6. POST signature
                                       pays gas, cannot change recipient
```

- **The link key never touches a server.** It lives in the URL fragment (after `#`), which browsers do not send in requests.
- **The claim signature names the recipient**, so the relayer (or anyone who copies the transaction) cannot redirect the money. That lets the server pay gas for recipients who have none.
- **Signatures are EIP-712**, bound to the chain and the escrow address, and each one covers a single transfer, so they cannot be replayed elsewhere.
- **The relayer verifies signatures before spending gas**, serialises its transactions, and blocks duplicate in-flight claims.

### Passkey accounts: one passkey, many keys (Mera)

Passkey sign-in uses [Mera](https://mera.category.xyz). A passkey ceremony returns 32 secret bytes (the WebAuthn PRF output), and Anvay turns them into three unrelated keys. None of them is ever stored ([`app/src/lib/meraKeys.ts`](app/src/lib/meraKeys.ts)):

| Key | Derivation | Used for |
| --- | --- | --- |
| Account key | Mera's standard path (BIP-39 entropy, then BIP-32 `m/44'/60'/0'/0/0`) | Signing transactions through a Mera signing session and viem |
| Claim-link root | HKDF(prf, `anvay.v1.claim-links`); each link = HKDF(root, `link/<deposit nonce>`) | Every payment link's secret key |
| Notes key | HKDF(prf, `anvay.v1.notes`) as AES-256-GCM | Sealing the private "who is it for" notes kept on the device |

Because each link key comes from the passkey and the deposit's nonce, **a lost phone loses nothing**. Sign in with the same passkey on any device, and Anvay finds your transfers on-chain, re-derives every link key, and matches it to the transfer's claim address. Unclaimed links can be shared again or cancelled. Notes stay readable only to that passkey.

Passkeys sync through iCloud Keychain and Google Password Manager, so the same account opens on the user's other devices. Email/phone sign-in (Privy) remains available for devices whose passkeys don't support PRF yet.

Tests: [`app/scripts/mera-keys.test.mts`](app/scripts/mera-keys.test.mts) checks the derivation, including that Mera and viem agree on the account address. [`app/scripts/passkey-flow.mjs`](app/scripts/passkey-flow.mjs) drives Chrome with a virtual PRF authenticator through sign-up, faucet, sending, reload and recovery, and a second account collecting.

### Live rupee rate: Chainlink CRE

Rupee amounts come from **`InrRateFeed`** on Monad, written by a Chainlink Runtime Environment workflow ([`cre/inr-rate/main.ts`](cre/inr-rate/main.ts)):

1. A cron trigger fires (every 10 minutes when deployed).
2. Each node fetches USD→INR from three independent public sources (open.er-api, Frankfurter/ECB and fawazahmed0's currency-api), drops implausible answers, and takes the median. At least two sources must answer.
3. The DON agrees on the median of the nodes' answers (`consensusMedianAggregation`).
4. The report `abi.encode(uint256 inrPerUsdE6, uint64 observedAt)` is written through the Chainlink forwarder to [`InrRateFeed`](src/InrRateFeed.sol). The feed only accepts the forwarder, rejects stale or replayed reports, and rejects rates outside 10–1000 INR.

The app reads the feed on the server and labels amounts "via Chainlink on Monad". If the feed is older than 24 hours, it falls back to a public API.

CRE supports Monad testnet for simulation; deploying to the Chainlink DON on Monad is mainnet-only and needs Early Access. The workflow has been run with `cre workflow simulate --broadcast`, which writes for real through Monad testnet's simulation forwarder ([example update](https://testnet.monadvision.com/tx/0x181a023afd86b9148a6b3c8f853d4512ba386c0a09a060d2aab4ce24b01a0890)). Moving to production is a forwarder change (`setForwarder`) plus `cre workflow deploy`.

```bash
cd cre && cp .env.example .env    # funded Monad testnet key for gas
cre login
cre workflow simulate inr-rate --target staging-settings --broadcast
```

### Indexing: Envio

[`indexer/`](indexer) is an Envio HyperIndex project that reads Monad testnet through HyperSync. It indexes `ClaimLinkEscrow` (`Deposited`, `Claimed`, `Cancelled`) and `InrRateFeed` (`RateUpdated`) into:

- `Transfer`: each payment link and its current state (pending, claimed or cancelled; who collected it; when)
- `Account`: per-address totals sent and collected
- `Stats`: global links, collected, volume, unique senders and recipients
- `RateUpdate`: every rate the Chainlink workflow wrote

The hosted indexer ([GraphQL](https://indexer.dev.hyperindex.xyz/2a6b003/v1/graphql)) powers the public [/stats](https://anvay-pay.vercel.app/stats) page (real usage only; senders from our automated end-to-end tests are listed in [`app/src/lib/testAccounts.ts`](app/src/lib/testAccounts.ts) and excluded) and to find a passkey account's transfers quickly when rebuilding its links. Both fall back to reading the contract directly when `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` isn't set.

```bash
cd indexer && npm install && npm test   # Envio runs on Linux/macOS (WSL on Windows); tests replay real HyperSync data
```

### The AI assistant

"Just say it" uses **Qwen** (`qwen/qwen3.8-27b`) with a single `draft_payment` tool. It understands English, Hindi, Hinglish and Devanagari, plus Indian number words (hazaar, lakh, crore). The model only drafts a payment. The user confirms every one, and the server enforces the rules:

- currency conversion is done server-side with the live rate, never by the model
- a draft is only accepted if the user actually wrote that currency (models sometimes guess)
- amounts are capped, and malformed tool output becomes a clarifying question, never a draft

## Security model and known limits

Anvay never holds anyone's money. Dollars wait in `ClaimLinkEscrow`, and only the contract's own rules can release them.

### What protects a payment

| Guarantee | How |
| --- | --- |
| Nobody can take money out of the escrow except by its rules | The contract has three functions: `deposit`, `claim`, `cancel`. It has no owner, no admin, no pause, no upgrade path and no sweep function. |
| The link key never reaches a server | It is generated in the sender's browser and lives in the URL `#fragment`, which browsers never send in requests. Vercel, the API and its logs never see it. |
| A claim cannot be redirected | The link key signs EIP-712 `Claim(transferId, recipient)`. The contract pays the address inside the signature, so the relayer, or anyone copying the transaction, cannot change where the money goes. |
| A signature cannot be reused | Each signature covers one transfer id, and the EIP-712 domain binds it to this chain and this escrow address. A transfer can be claimed or cancelled only once. |
| The sender stays in control | Until a link is collected, its sender (and only its sender) can cancel it and get the full amount back. |
| A leaked relayer key cannot touch user funds | The relayer only pays gas. With its key an attacker could spend its MON, mint worthless testnet dollars and update the testnet rate feed, but could not move money held in the escrow. |
| No passwords or seed phrases | Passkey accounts are derived from the device's passkey (WebAuthn PRF) and nothing secret is stored. Google and email accounts use Privy embedded wallets. |

The contracts are source-verified, the code is open, and `test/` covers front-running, replay, signature malleability, expiry, cancellation and fuzzed amounts. The escrow is also exercised against Agora's real AUSD on a mainnet fork.

### Known limits

These matter before Anvay handles real money:

- **A link is a bearer instrument.** Whoever opens it first can collect it, so a forwarded chat or a shared phone puts it at risk. The sender can cancel an uncollected link. Planned: an optional PIN shared separately, or links locked to a phone number or email.
- **The web app is a trust point.** If the site were compromised, malicious code could read link keys or a passkey account's key while a page is open, as with any web wallet. Today: open source, deploys only from this repository, keys stay in memory. Planned: a strict Content Security Policy, signed releases and an IPFS-pinned build.
- **No external audit yet.** The escrow is about 120 lines and fully tested, but tests are not an audit.
- **Third parties:** AUSD depends on Agora (which can freeze addresses and must keep it backed). Google and email accounts depend on Privy. Monad is a young network.
- **The rupee rate on testnet** is written by the Chainlink CRE workflow run in simulation (`cre workflow simulate --broadcast`), not by a deployed Chainlink DON. It only affects displayed rupee amounts and rupee-to-dollar conversion before the sender confirms. Payments are always in dollars.
- **Regulation.** Sending money from abroad to India falls under FEMA and RBI rules, and paying out rupees to a bank account needs a licensed partner. Anvay is a working prototype on testnet, not a licensed remittance service.

## Contracts

All contracts are source-verified on MonadVision (Sourcify).

| Contract | Testnet address |
| --- | --- |
| `ClaimLinkEscrow` | [`0x607B0075fd9602820AA9Ef4395D7b32657a10cDa`](https://testnet.monadvision.com/address/0x607B0075fd9602820AA9Ef4395D7b32657a10cDa) |
| `MockAUSD` (6 decimals, testnet only) | [`0x73E297c20cdee9291D09A66563C78939E5CA9aB5`](https://testnet.monadvision.com/address/0x73E297c20cdee9291D09A66563C78939E5CA9aB5) |
| `InrRateFeed` (Chainlink CRE consumer) | [`0x12cC9B5656F7593C2FeF04964D35752d7e3dc60F`](https://testnet.monadvision.com/address/0x12cC9B5656F7593C2FeF04964D35752d7e3dc60F) |

On mainnet (chain 143) the escrow uses Agora's AUSD at `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`. [`script/DeployEscrow.s.sol`](script/DeployEscrow.s.sol) picks the right token for the chain.

## Mainnet readiness

The live app runs on testnet, so anyone can try it for free. Mainnet support is tested without spending real funds:

- [`script/e2e-mainnet-fork.sh`](script/e2e-mainnet-fork.sh) forks Monad mainnet locally and deploys `ClaimLinkEscrow` against **Agora's real AUSD contract**. It borrows 100 AUSD from an existing holder (possible only on the local fork), then runs deposit, a relayed claim to a recipient with 0 MON, a blocked redirect attempt, and a cancel. Every step passes and the escrow ends empty.
- `DeployEscrow.s.sol` dry-runs cleanly against mainnet and selects real AUSD.
- Switching the app is configuration only: `NEXT_PUBLIC_NETWORK=mainnet` plus the mainnet escrow and AUSD addresses. On mainnet the test-dollar faucet is disabled automatically.

## Repository

```
src/ClaimLinkEscrow.sol      escrow: deposit, claim (EIP-712), cancel
src/MockAUSD.sol             testnet stand-in for AUSD
src/InrRateFeed.sol          Chainlink CRE consumer holding the USD->INR rate
test/                        35 Foundry tests incl. front-running, replay, malleability, fuzz, forwarder checks
cre/inr-rate/                Chainlink CRE workflow (TypeScript) writing the rate on-chain
indexer/                     Envio HyperIndex indexer for the escrow and the rate feed
script/                      deploy script, testnet-fork and mainnet-fork (real AUSD) end-to-end checks
app/                         Next.js app (Privy login, send, claim, relayer, assistant)
app/scripts/                 API tests against a local fork and a fake/real Qwen
```

## Run it locally

Requirements: [Foundry](https://getfoundry.sh) 1.8+, Node 20+.

```bash
# contracts
forge test

# app
cd app
cp .env.example .env.local   # fill in the values described in the file
npm install
npm run dev                  # http://localhost:3000
```

`.env.local` needs a Privy App ID, a funded testnet relayer key, and (optionally) a Qwen key from any OpenAI-compatible host. Groq's free tier works. Without a Qwen key the assistant is hidden and everything else works.

## Tech

Monad · Solidity + Foundry · OpenZeppelin · Agora AUSD · Chainlink CRE · Envio HyperIndex · Next.js · viem · Mera passkeys · Privy embedded wallets · Qwen (via Groq)

## Limitations and next steps

- **Cashing out to a bank account in rupees** needs a licensed off-ramp partner. Today the recipient holds dollars (AUSD) in Anvay. Rupee amounts are shown as estimates at the live rate.
- **Sender gas:** on testnet a faucet tops up new users. On mainnet the plan is Privy's native gas sponsorship.
- **Sent links:** passkey accounts rebuild them from the passkey on any device. Google and email accounts still keep them on the device that created them.
- **Phone sign-in** works for US and Canadian numbers only (Privy's free plan). People in India sign in with a passkey, Google or email.
- See [Security model and known limits](#security-model-and-known-limits) for what must change before real money.
- Rate limits and the relayer's nonce lock are in-memory. This is fine for a single instance, and a shared store comes before scaling out.
