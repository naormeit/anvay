// End-to-end passkey (Mera) flow against a running Anvay app, using Chrome's virtual WebAuthn authenticator with PRF.
// Usage: npm i --no-save playwright-core && node scripts/passkey-flow.mjs [http://localhost:3000]
// Needs Google Chrome installed (CHROME env var to override the path). Spends testnet gas from the relayer.
import { chromium } from "playwright-core";

const APP = process.argv[2] ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function newPasskeyPage() {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  page.on("pageerror", (e) => console.log("  [page error]", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("  [console]", m.text().slice(0, 600)));
  return { context, page, cdp, authenticatorId };
}

const step = (msg) => console.log(`\n== ${msg}`);
const ok = (msg) => console.log(`   ok: ${msg}`);

// ---------------------------------------------------------------- sender
step("sender creates a passkey account");
const sender = await newPasskeyPage();
await sender.page.goto(APP);
await sender.page.getByRole("button", { name: "Create an account with a passkey" }).click();
await sender.page.getByText("Your balance").waitFor({ timeout: 30000 });
ok("signed in, balance card visible");
const creds = await sender.cdp.send("WebAuthn.getCredentials", { authenticatorId: sender.authenticatorId });
ok(`authenticator holds ${creds.credentials.length} passkey(s) for rpId ${creds.credentials[0]?.rpId}`);

step("sender adds test dollars (relayer faucet)");
await sender.page.getByRole("button", { name: "Add $100 test dollars" }).click();
await sender.page.getByText("$100.00").first().waitFor({ timeout: 60000 });
ok("balance shows $100.00");
await sender.page.waitForTimeout(Number(process.env.PAUSE_MS ?? 0));

step("sender creates a $5 link for Mom");
await sender.page.getByLabel("Amount in dollars").fill("5");
await sender.page.getByPlaceholder("Who is it for? (optional)").fill("Mom");
await sender.page.getByRole("button", { name: "Create payment link" }).click();
await sender.page.getByText("is on its way").waitFor({ timeout: 90000 }).catch(async (e) => {
  console.log("   page text:", (await sender.page.locator("main").innerText()).slice(0, 800));
  throw e;
});
const waHref = await sender.page.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
const claimUrl = decodeURIComponent(waHref).match(/https?:\/\/\S+\/claim#t=\d+&k=0x[0-9a-fA-F]{64}/)[0];
ok(`link created: ${claimUrl.replace(/k=0x[0-9a-fA-F]+/, "k=<redacted>")}`);

step("sender reloads (keys wiped from memory) and signs back in with the same passkey");
await sender.page.reload();
await sender.page.getByRole("button", { name: "Sign in with your passkey" }).click();
await sender.page.getByText("Restored with your passkey").waitFor({ timeout: 60000 });
const sentRow = sender.page.getByText("$5.00").first();
await sentRow.waitFor();
const hasNote = await sender.page.getByText("· Mom").count();
ok(`sent link recovered from the passkey; sealed note "Mom" ${hasNote ? "decrypted" : "MISSING"}`);

step("sender re-opens the recovered link and gets the same claim URL");
await sentRow.click();
const recoveredHref = await sender.page.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
const recoveredUrl = decodeURIComponent(recoveredHref).match(/https?:\/\/\S+\/claim#t=\d+&k=0x[0-9a-fA-F]{64}/)[0];
console.log(recoveredUrl === claimUrl ? "   ok: recovered link is identical to the original" : "   FAIL: recovered link differs");

// ---------------------------------------------------------------- recipient
step("recipient opens the link and creates their own passkey account");
const recipient = await newPasskeyPage();
await recipient.page.goto(claimUrl);
await recipient.page.getByText("Someone sent you").waitFor({ timeout: 30000 });
await recipient.page.getByRole("button", { name: "Create an account with a passkey" }).click();
await recipient.page.getByRole("button", { name: /Collect \$5\.00/ }).click();
await recipient.page.getByText("Collected", { exact: true }).waitFor({ timeout: 90000 });
ok("recipient collected $5.00 (gas paid by relayer)");

step("sender sees the link as collected");
await sender.page.getByRole("button", { name: "Refresh" }).click();
await sender.page.getByText("Collected").first().waitFor({ timeout: 30000 });
ok("status: Collected");

await browser.close();
console.log("\nPASSKEY FLOW PASSED");
