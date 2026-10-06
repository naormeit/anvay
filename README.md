# Anvay

**Send dollars home with a link.** Type an amount, share the link on WhatsApp, and your family taps to collect it in seconds. No bank details, no app to install, and almost no fees.

Built on [Monad](https://monad.xyz) for the Metropolis hackathon (Track 2: Consumer Products & Payments).

- **Live app:** https://anvay-pay.vercel.app (testnet; use "Add $100 test dollars" to try it)
- **Network:** Monad testnet (chain 10143). The same contracts are tested against Agora's real AUSD on a mainnet fork (see [Mainnet readiness](#mainnet-readiness)).

## Why

India receives more remittances than any other country. Sending money home today means bank forms, transfer fees, poor exchange rates and waits of hours or days. Anvay makes it as simple as sending a message:

1. **Sign in** with email or phone. Anvay creates an account in the background (a Privy embedded wallet). No seed phrases and no crypto words anywhere in the app.
2. **Create a link** for any amount in dollars or rupees, or just type *"Send ₹5,000 to Mom"* or *"Papa ko 2 hazaar bhej do"*.
3. **Share it** on WhatsApp. The recipient opens it, signs in with their phone or email, and taps **Collect**. They need no gas, no wallet and no app.

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

### The AI assistant

"Just say it" uses **Qwen** (`qwen/qwen3.8-27b`) with a single `draft_payment` tool. It understands English, Hindi, Hinglish and Devanagari, plus Indian number words (hazaar, lakh, crore). The model only drafts a payment. The user confirms every one, and the server enforces the rules:

- currency conversion is done server-side with the live rate, never by the model
- a draft is only accepted if the user actually wrote that currency (models sometimes guess)
- amounts are capped, and malformed tool output becomes a clarifying question, never a draft

## Contracts

Both contracts are source-verified on MonadVision (Sourcify).

| Contract | Testnet address |
| --- | --- |
| `ClaimLinkEscrow` | [`0x607B0075fd9602820AA9Ef4395D7b32657a10cDa`](https://testnet.monadvision.com/address/0x607B0075fd9602820AA9Ef4395D7b32657a10cDa) |
| `MockAUSD` (6 decimals, testnet only) | [`0x73E297c20cdee9291D09A66563C78939E5CA9aB5`](https://testnet.monadvision.com/address/0x73E297c20cdee9291D09A66563C78939E5CA9aB5) |

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
test/ClaimLinkEscrow.t.sol   26 Foundry tests incl. front-running, replay, malleability, fuzz
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

Monad · Solidity + Foundry · OpenZeppelin · Agora AUSD · Next.js · viem · Privy embedded wallets · Qwen (via Groq)

## Limitations and next steps

- **Cashing out to a bank account in rupees** needs a licensed off-ramp partner. Today the recipient holds dollars (AUSD) in Anvay. Rupee amounts are shown as estimates at the live rate.
- **Sender gas:** on testnet a faucet tops up new users. On mainnet the plan is Privy's native gas sponsorship.
- **Sent links** are stored on the sender's device, so they can re-share or cancel. Moving them to an account-backed store is next.
- Rate limits and the relayer's nonce lock are in-memory. This is fine for a single instance, and a shared store comes before scaling out.
