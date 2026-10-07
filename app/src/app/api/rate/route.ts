import { getInrRate } from "@/lib/rate";

export async function GET() {
  try {
    const { inrPerUsd, source, updatedAt } = await getInrRate();
    return Response.json({ inrPerUsd, source, updatedAt });
  } catch (err) {
    console.error("rate failed", err);
    return Response.json({ error: "Exchange rate unavailable." }, { status: 503 });
  }
}
