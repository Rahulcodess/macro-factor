import { NextResponse } from "next/server";
import { callGroq } from "@/lib/ai";
import { AROMI_SYSTEM_PROMPT } from "@/lib/aromi-prompt";
import { searchNutrition } from "@/lib/food-api";
import type { AromiRequest, AromiResponse } from "@/lib/types";

const MAX_KCAL_PER_SERVING = 2000;

/** Sanitize calorie value from AI (often returns joules or garbage). */
function sanitizeCalories(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(String(raw).replace(/[^\d.]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= MAX_KCAL_PER_SERVING) return Math.round(n);
  if (n > MAX_KCAL_PER_SERVING && n < 500_000) {
    const asKcal = Math.round(n / 4184);
    return asKcal <= MAX_KCAL_PER_SERVING ? asKcal : MAX_KCAL_PER_SERVING;
  }
  return MAX_KCAL_PER_SERVING;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AromiRequest;
    // Enrich food_estimation with free API data when available
    let apiNutrition: Record<string, unknown> | null = null;
    if (
      body.intent === "food_estimation" &&
      body.food_text &&
      typeof body.food_text === "string"
    ) {
      const estimate = await searchNutrition(body.food_text);
      if (estimate) {
        apiNutrition = {
          calories: estimate.calories,
          protein_g: estimate.protein_g,
          carbs_g: estimate.carbs_g,
          fat_g: estimate.fat_g,
          source: estimate.source,
          confidence_range: estimate.confidence_range,
        };
      }
    }
    const payload = {
      ...body,
      ...(apiNutrition && { api_nutrition_hint: apiNutrition }),
    };
    const userInput = JSON.stringify(payload);
    const temperature =
      body.intent === "workout_plan" || body.intent === "adjust_plan" ? 0.85 : 0.3;
    const aiResponse = await callGroq<AromiResponse>({
      systemPrompt: AROMI_SYSTEM_PROMPT,
      userInput,
      temperature,
    });

    // When we have Open Food Facts data, prefer it and scale by grams so numbers stay sane
    if (
      body.intent === "food_estimation" &&
      apiNutrition &&
      typeof apiNutrition.calories === "number"
    ) {
      const grams = body.grams && body.grams > 0 ? body.grams : 100;
      const scale = grams / 100;
      const calories = Math.round((apiNutrition.calories as number) * scale);
      const protein_g = Math.round((Number(apiNutrition.protein_g) || 0) * scale * 10) / 10;
      const carbs_g = Math.round((Number(apiNutrition.carbs_g) || 0) * scale * 10) / 10;
      const fat_g = Math.round((Number(apiNutrition.fat_g) || 0) * scale * 10) / 10;
      return NextResponse.json({
        ...aiResponse,
        data: {
          ...aiResponse.data,
          estimated_calories: Math.min(calories, 2000),
          confidence_range: apiNutrition.confidence_range ?? "±10%",
          macros: { protein_g, carbs_g, fat_g },
        },
      });
    }

    // Sanitize AI calorie output so we never send absurd values (e.g. 320380)
    if (body.intent === "food_estimation" && aiResponse.data && typeof aiResponse.data === "object") {
      const raw = (aiResponse.data as Record<string, unknown>).estimated_calories ?? (aiResponse.data as Record<string, unknown>).calories;
      const sane = sanitizeCalories(raw);
      if (sane != null) {
        aiResponse.data = {
          ...aiResponse.data,
          estimated_calories: sane,
        };
      }
    }

    return NextResponse.json(aiResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        response_type: "message",
        message: "Something went wrong. Please try again.",
        data: {},
        ui_hint: "chat_only",
        error: message,
      },
      { status: 500 }
    );
  }
}
