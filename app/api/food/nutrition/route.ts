import { NextResponse } from "next/server";
import { searchNutrition } from "@/lib/food-api";

/**
 * GET /api/food/nutrition?q= paneer
 * Free Open Food Facts search — no API key. Use to enrich AI estimates.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q");
  if (!q?.trim()) {
    return NextResponse.json(
      { error: "Missing query parameter: q" },
      { status: 400 }
    );
  }
  try {
    const estimate = await searchNutrition(q.trim());
    return NextResponse.json(estimate ?? { calories: null, source: "no_match" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 500 }
    );
  }
}
