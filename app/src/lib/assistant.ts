import "server-only";

/**
 * Turns a free-text request ("send ₹5,000 to Mom", "papa ko 2 hazaar bhej do") into a payment draft using Qwen.
 * The model only extracts intent. It never moves money: the user confirms every draft in the app.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AssistantResult =
  | { type: "draft"; amount: number; currency: "USD" | "INR"; recipient: string | null; text?: string }
  | { type: "reply"; text: string };

const SYSTEM_PROMPT = `You are the assistant inside Anvay, an app for sending money to family in India with a link.
Your only job is to turn what the user types into one payment draft by calling draft_payment, or to ask one short question when something essential is missing.

Rules:
- Currency: "₹", "Rs", "rupees", "rupaye", "रुपये", "INR" mean INR. "$", "dollars", "USD", "bucks" mean USD.
- Indian number words "hazaar"/"hazar"/"हज़ार", "lakh"/"लाख" and "crore" mean INR even without a currency word, because people only count rupees that way. "2 hazaar" = 2,000 INR; "1.5 lakh" = 150,000 INR.
- A plain number, "5k" or "thousand" with no currency word or symbol is ambiguous: do NOT call draft_payment, ask whether they mean dollars or rupees. Never guess.
- recipient is who the money is for, exactly as the user said it ("Mom", "Papa", "Ravi bhaiya"). If they did not say, call draft_payment with recipient null. Never ask who it is for, and never invent a name.
- One payment at a time. If they ask for several payments, call draft_payment for the first one only, and in your message text say which one you will do next. If the currency is missing, ask about the currency first (one question covering all of them).
- Earlier messages may show a payment link was already created. If the user then says "next", "now Papa" or similar, draft the next payment they asked for earlier, with that person's name as recipient.
- You cannot send money yourself. The user confirms the draft in the app. Never say money has been sent.
- If the message is not about sending money, say in one sentence that you can only help send money.
- Reply in the user's language (English, Hindi or Hinglish). Keep replies to one short sentence.`;

const DRAFT_TOOL = {
  type: "function",
  function: {
    name: "draft_payment",
    description: "Prepare a payment for the user to review and confirm. Does not send anything.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in the currency the user used, e.g. 5000 for ₹5,000." },
        currency: { type: "string", enum: ["USD", "INR"] },
        recipient: { type: ["string", "null"], description: "Who it is for, as the user said it, or null." },
      },
      required: ["amount", "currency", "recipient"],
    },
  },
} as const;

export function assistantConfig() {
  const apiKey = process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL?.replace(/\/+$/, "");
  const model = process.env.QWEN_MODEL || "qwen3.8-max";
  return apiKey && baseUrl ? { apiKey, baseUrl, model } : null;
}

/** Thrown when the model host is rate limiting us, so the route can say "busy" instead of "broken". */
export class AssistantBusyError extends Error {}

type ToolCall = { function?: { name?: string; arguments?: string } };
type CompletionResponse = { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };

export async function runAssistant(messages: ChatMessage[]): Promise<AssistantResult> {
  const config = assistantConfig();
  if (!config) throw new Error("Assistant is not configured");

  const request = () =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        tools: [DRAFT_TOOL],
        tool_choice: "auto",
      }),
      signal: AbortSignal.timeout(20_000),
    });

  let res = await request();
  if (res.status === 429) {
    // Free tiers limit tokens per minute. Wait as long as the host asks (capped) and try once more.
    const body = await res.text();
    const seconds = Number(res.headers.get("retry-after") ?? body.match(/try again in ([\d.]+)s/)?.[1] ?? 2);
    const wait = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0.5), 6) : 2;
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await request();
    if (res.status === 429) throw new AssistantBusyError("model host is rate limiting");
  }
  if (!res.ok) throw new Error(`Qwen returned ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const message = ((await res.json()) as CompletionResponse).choices?.[0]?.message;
  // Qwen3 models can include their reasoning in <think> tags; only show the answer.
  const text = message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  const call = message?.tool_calls?.find((c) => c.function?.name === "draft_payment");
  if (call?.function?.arguments) {
    const draft = parseDraft(call.function.arguments);
    return draft.type === "draft" && text ? { ...draft, text: text.slice(0, 200) } : draft;
  }
  return { type: "reply", text: text || "Sorry, I didn't catch that. How much would you like to send, and to whom?" };
}

const CURRENCY_WORDS: Record<"USD" | "INR", RegExp> = {
  INR: /₹|\brs\.?|\binr\b|rupee|rupay|rupai|रुप|\bhaz+a+r|\bhajar|हज़ार|हजार|\blakh|\blac\b|लाख|\bcrore|करोड़/i,
  USD: /\$|\busd\b|dollar|\bbucks?\b|डॉलर/i,
};

/**
 * True if the user's own words name the currency the model chose. Models sometimes guess a currency
 * despite instructions, so a draft is only accepted when the user actually said it.
 */
export function userNamedCurrency(messages: ChatMessage[], currency: "USD" | "INR") {
  return messages.some((m) => m.role === "user" && CURRENCY_WORDS[currency].test(m.content));
}

/** Validate the model's tool arguments. Anything malformed becomes a clarifying question, never a draft. */
export function parseDraft(rawArgs: string): AssistantResult {
  let args: { amount?: unknown; currency?: unknown; recipient?: unknown };
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { type: "reply", text: "Sorry, I didn't catch that. How much would you like to send?" };
  }
  const amount = typeof args.amount === "number" ? args.amount : Number(args.amount);
  const currency = args.currency === "USD" || args.currency === "INR" ? args.currency : null;
  if (!Number.isFinite(amount) || amount <= 0 || !currency) {
    return { type: "reply", text: "How much would you like to send, and is that in dollars or rupees?" };
  }
  const recipient =
    typeof args.recipient === "string" && args.recipient.trim() ? args.recipient.trim().slice(0, 40) : null;
  return { type: "draft", amount: Math.round(amount * 100) / 100, currency, recipient };
}
