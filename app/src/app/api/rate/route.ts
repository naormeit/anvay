import { getInrRate } from "@/lib/rate";

export async function GET() {
  try {
    const { inrPerUsd, updatedAt } = await getInrRate();
    return Response.json({ inrPerUsd, updatedAt });
  } catch (err) {
    console.error("rate failed", err);
    return Response.json({ error: "Exchange rate unavailable." }, { status: 503 });
  }
}
