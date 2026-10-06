import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex, type Hex } from "viem";

/**
 * One passkey, many keys.
 *
 * A Mera passkey ceremony returns 32 secret bytes (the WebAuthn PRF output). Anvay turns them into three
 * unrelated keys, and none of them is ever stored:
 *
 *   1. the account key: Mera's documented path (BIP-39 entropy, then BIP-32 m/44'/60'/0'/0/0)
 *   2. the claim-link root: HKDF(prf, "anvay.v1.claim-links"); each payment link's key is
 *      HKDF(root, "link/<deposit tx nonce>"), so every link can be re-created on any device
 *   3. the notes key: HKDF(prf, "anvay.v1.notes"), an AES-256-GCM key that seals the private
 *      "who is it for" notes kept on the device
 *
 * HKDF with distinct `info` strings gives independent outputs: knowing one key reveals nothing about the others.
 */

const encoder = new TextEncoder();
const HKDF_SALT = encoder.encode("anvay.v1");
const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

async function hkdf(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export type AnvayKeys = {
  /** secp256k1 key for the Anvay account. Hand it to a Mera signing session, then zero it. */
  accountKey: Uint8Array;
  /** Root for per-link claim keys. */
  linkRoot: Uint8Array;
  /** AES-256-GCM key for sealing notes. Non-extractable. */
  notesKey: CryptoKey;
};

export async function deriveAnvayKeys(prfOutput: Uint8Array): Promise<AnvayKeys> {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist))).derive(ACCOUNT_PATH);
  if (!node.privateKey) throw new Error("account derivation produced no key");
  const accountKey = new Uint8Array(node.privateKey);
  node.wipePrivateData();

  const linkRoot = await hkdf(prfOutput, "anvay.v1.claim-links");
  const notesBytes = await hkdf(prfOutput, "anvay.v1.notes");
  const notesKey = await crypto.subtle.importKey("raw", notesBytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
  notesBytes.fill(0);
  return { accountKey, linkRoot, notesKey };
}

/** The claim-link private key for the deposit sent with account nonce `nonce`. */
export async function linkKeyForNonce(linkRoot: Uint8Array, nonce: number): Promise<Hex> {
  return bytesToHex(await hkdf(linkRoot, `link/${nonce}`));
}

/** Seal a JSON value with the notes key. Output is base64 of iv || ciphertext. */
export async function sealJson(notesKey: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, notesKey, encoder.encode(JSON.stringify(value))),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

/** Open a value sealed by `sealJson`. Returns null if it was sealed by a different passkey or is corrupt. */
export async function openJson<T>(notesKey: CryptoKey, sealed: string): Promise<T | null> {
  try {
    const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, notesKey, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}
