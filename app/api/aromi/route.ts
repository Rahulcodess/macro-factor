import { NextResponse } from "next/server";
import { callGroq } from "@/lib/ai";
import { AROMI_SYSTEM_PROMPT } from "@/lib/aromi-prompt";
import { searchNutrition } from "@/lib/food-api";
import type { AromiRequest, AromiResponse } from "@/lib/types";

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
