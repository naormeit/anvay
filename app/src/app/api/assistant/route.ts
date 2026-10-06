import { AssistantBusyError, assistantConfig, runAssistant, userNamedCurrency, type ChatMessage } from "@/lib/assistant";
import { AUSD_DECIMALS } from "@/lib/config";
import { inrToUsdUnits } from "@/lib/format";
import { getInrRate } from "@/lib/rate";
import { parseUnits } from "viem";

const MAX_MESSAGES = 8;
const MAX_CHARS = 400;
const MAX_USD = 10_000;
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT.max;
}

/** Lets the UI hide the assistant when no Qwen key is configured. */
export async function GET() {
  return Response.json({ enabled: assistantConfig() !== null });
}

export async function POST(request: Request) {
  if (!assistantConfig()) return Response.json({ error: "The assistant is not set up." }, { status: 503 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: "Too many requests. Wait a minute." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const raw = Array.isArray(body?.messages) ? body.messages : [];
  const messages: ChatMessage[] = raw
    .slice(-MAX_MESSAGES)
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Say what you would like to send." }, { status: 400 });
  }

  try {
    const result = await runAssistant(messages);
    if (result.type === "reply") return Response.json(result);
    if (!userNamedCurrency(messages, result.currency)) {
      return Response.json({ type: "reply", text: "Is that in dollars or rupees?" });
    }

    // Convert on the server with today's rate; the model never does currency maths.
    const { inrPerUsd } = await getInrRate();
    const units =
      result.currency === "INR"
        ? inrToUsdUnits(result.amount, inrPerUsd)
        : parseUnits(result.amount.toFixed(2), AUSD_DECIMALS);
    if (units <= BigInt(0)) {
      return Response.json({ type: "reply", text: "That amount is too small to send. Try a larger amount." });
    }
    if (units > parseUnits(String(MAX_USD), AUSD_DECIMALS)) {
      return Response.json({ type: "reply", text: `You can send up to $${MAX_USD.toLocaleString("en-US")} at a time.` });
    }
    return Response.json({ ...result, units: units.toString(), inrPerUsd });
  } catch (err) {
    if (err instanceof AssistantBusyError) {
      return Response.json({ error: "The assistant is busy. Try again in a few seconds." }, { status: 429 });
    }
    console.error("assistant failed", err);
    return Response.json({ error: "The assistant is unavailable right now. Use the form below." }, { status: 502 });
  }
}
