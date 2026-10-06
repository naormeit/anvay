// Run: node scripts/mera-keys.test.mts
// Checks the passkey key derivation in src/lib/meraKeys.ts without a browser or authenticator.
import assert from "node:assert/strict";
import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { deriveAnvayKeys, linkKeyForNonce, openJson, sealJson } from "../src/lib/meraKeys.ts";

const prfA = new Uint8Array(32).map((_, i) => i + 1);
const prfB = new Uint8Array(32).map((_, i) => 255 - i);

const a1 = await deriveAnvayKeys(prfA);
const a2 = await deriveAnvayKeys(prfA);
const b = await deriveAnvayKeys(prfB);

// 1. Deterministic: the same passkey output always gives the same account.
assert.deepEqual(a1.accountKey, a2.accountKey, "account key is deterministic");
assert.deepEqual(a1.linkRoot, a2.linkRoot, "link root is deterministic");

// 2. The account address matches Mera's own session and viem's independent BIP-39/BIP-32 derivation.
const session = createSecp256k1SigningSession({ privateKey: a1.accountKey });
const meraAddress = getEvmAddress(session.publicKey);
session.end();
const viemAddress = mnemonicToAccount(entropyToMnemonic(prfA, wordlist)).address;
assert.equal(meraAddress.toLowerCase(), viemAddress.toLowerCase(), "Mera and viem agree on the account address");

// 3. Link keys: valid, deterministic, unique per nonce, and unrelated to the account key.
const keys = await Promise.all([0, 1, 2, 3, 50, 1000].map((n) => linkKeyForNonce(a1.linkRoot, n)));
assert.equal(new Set(keys).size, keys.length, "every nonce gives a different link key");
assert.equal(await linkKeyForNonce(a2.linkRoot, 2), keys[2], "link keys are re-derivable");
for (const k of keys) privateKeyToAccount(k); // throws if not a valid secp256k1 key
const accountHex = "0x" + Buffer.from(a1.accountKey).toString("hex");
assert.ok(!keys.includes(accountHex as `0x${string}`), "link keys never equal the account key");

// 4. A different passkey gives a different account and different links.
assert.notDeepEqual(a1.accountKey, b.accountKey);
assert.notEqual(await linkKeyForNonce(b.linkRoot, 0), keys[0]);

// 5. Notes: sealed with one passkey, unreadable with another.
const sealed = await sealJson(a1.notesKey, { 7: "Mom", 8: "Papa" });
assert.deepEqual(await openJson(a2.notesKey, sealed), { 7: "Mom", 8: "Papa" }, "same passkey opens notes");
assert.equal(await openJson(b.notesKey, sealed), null, "a different passkey cannot open notes");
assert.notEqual(await sealJson(a1.notesKey, { x: 1 }), await sealJson(a1.notesKey, { x: 1 }), "fresh IV every seal");

console.log("account address:", meraAddress);
console.log("link key for nonce 0 -> claim address:", privateKeyToAccount(keys[0]).address);
console.log("all mera key checks passed");
