import { NextResponse } from "next/server";
import { callGroq } from "@/lib/ai";
import { AROMI_SYSTEM_PROMPT } from "@/lib/aromi-prompt";
import { getCalorieNinjasNutrition } from "@/lib/calorie-ninjas";
import { searchNutrition } from "@/lib/food-api";
import { clampCaloriesByCategory } from "@/lib/food-sanity";
import type { AromiRequest, AromiResponse } from "@/lib/types";

const MAX_KCAL_PER_SERVING = 2000;

/** Reliable per-scoop values for whey/protein powder (USDA-style; 1 scoop ≈ 30g). */
const WHEY_PER_SCOOP = { calories: 120, protein_g: 24, carbs_g: 2, fat_g: 1.5 };

/** If food is clearly whey/protein powder and estimate is way too low, return sane override. */
function wheyOverride(
  foodText: string,
  currentCalories: number,
  grams?: number
): { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null {
  if (!/\b(whey|protein\s*powder|scoop|schoop)\b/i.test(foodText)) return null;
  const match = foodText.match(/(\d+)\s*(scoop|schoop|scoops)?/i) || foodText.match(/^(\d+)/);
  const scoops = match ? Math.min(5, Math.max(1, parseInt(match[1], 10))) : 1;
  const minSaneCal = 70 * scoops;
  if (currentCalories >= minSaneCal) return null;
  const cal = WHEY_PER_SCOOP.calories * scoops;
  const protein_g = WHEY_PER_SCOOP.protein_g * scoops;
  const carbs_g = WHEY_PER_SCOOP.carbs_g * scoops;
  const fat_g = WHEY_PER_SCOOP.fat_g * scoops;
  return { calories: cal, protein_g, carbs_g, fat_g };
}

/** Parse grams from text like "5g butter" or "10 g oil". */
function parseGramsFromText(foodText: string): number | null {
  const m = foodText.match(/(\d+)\s*g\b/i) || foodText.match(/\b(\d+)\s*grams?\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 && n <= 1000 ? n : null;
}

/** Butter ~7.2 kcal/g, oil ~9 kcal/g. Use when OFF/AI returns nonsense (e.g. 1 kcal for 5g butter). */
function fatOverride(
  foodText: string,
  currentCalories: number,
  grams?: number
): { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null {
  const g = (grams && grams > 0 ? grams : null) ?? parseGramsFromText(foodText);
  if (g == null || g > 500) return null;
  const isButter = /\b(butter|ghee|amul)\b/i.test(foodText);
  const isOil = /\b(oil|refined|mustard\s*oil|olive)\b/i.test(foodText);
  if (!isButter && !isOil) return null;
  const kcalPerGram = isButter ? 7.2 : 9;
  const expectedCal = Math.round(g * kcalPerGram);
  if (currentCalories >= expectedCal * 0.5) return null;
  const fat_g = Math.round(g * 0.99 * 10) / 10;
  return { calories: expectedCal, protein_g: 0, carbs_g: 0, fat_g };
}

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
    const foodText =
      body.intent === "food_estimation" &&
      body.food_text &&
      typeof body.food_text === "string"
        ? body.food_text
        : "";

    // Fetch nutrition in parallel: CalorieNinjas (primary) + Open Food Facts (fallback)
    let apiNutrition: Record<string, unknown> | null = null;
    if (body.intent === "food_estimation" && foodText) {
      const [cnResult, offResult] = await Promise.all([
        getCalorieNinjasNutrition(foodText),
        searchNutrition(foodText),
      ]);
      if (cnResult) {
        apiNutrition = {
          calories: cnResult.calories,
          protein_g: cnResult.protein_g,
          carbs_g: cnResult.carbs_g,
          fat_g: cnResult.fat_g,
          source: cnResult.source,
          confidence_range: cnResult.confidence_range,
        };
      } else if (offResult) {
        apiNutrition = {
          calories: offResult.calories,
          protein_g: offResult.protein_g,
          carbs_g: offResult.carbs_g,
          fat_g: offResult.fat_g,
          source: offResult.source,
          confidence_range: offResult.confidence_range,
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

    // When we have API nutrition (CalorieNinjas or Open Food Facts), use it with overrides + clamp
    if (
      body.intent === "food_estimation" &&
      apiNutrition &&
      typeof apiNutrition.calories === "number"
    ) {
      const fromCalorieNinjas = apiNutrition.source === "calorieninjas";
      const grams = body.grams && body.grams > 0 ? body.grams : 100;
      const scale = fromCalorieNinjas ? 1 : grams / 100; // CN returns totals; OFF is per 100g
      let calories =
        fromCalorieNinjas
          ? apiNutrition.calories as number
          : Math.round((apiNutrition.calories as number) * scale);
      let protein_g = Math.round((Number(apiNutrition.protein_g) || 0) * scale * 10) / 10;
      let carbs_g = Math.round((Number(apiNutrition.carbs_g) || 0) * scale * 10) / 10;
      let fat_g = Math.round((Number(apiNutrition.fat_g) || 0) * scale * 10) / 10;

      const effectiveGrams =
        body.grams != null && body.grams > 0
          ? body.grams
          : parseGramsFromText(foodText);
      const isFat = /\b(butter|ghee|oil|amul)\b/i.test(foodText);
      const minSaneForFat =
        effectiveGrams != null && isFat ? Math.round(effectiveGrams * 5) : 0;
      const skipOff =
        !fromCalorieNinjas && isFat && calories < minSaneForFat;

      if (!skipOff) {
        const gramsArg = body.grams != null && body.grams > 0 ? body.grams : undefined;
        const whey = wheyOverride(foodText, calories, gramsArg);
        const fat = fatOverride(foodText, calories, gramsArg);
        if (whey) {
          calories = whey.calories;
          protein_g = whey.protein_g;
          carbs_g = whey.carbs_g;
          fat_g = whey.fat_g;
        } else if (fat) {
          calories = fat.calories;
          protein_g = fat.protein_g;
          carbs_g = fat.carbs_g;
          fat_g = fat.fat_g;
        }
        const effectiveG =
          body.grams != null && body.grams > 0 ? body.grams : 100;
        calories = clampCaloriesByCategory(foodText, calories, effectiveG);
        return NextResponse.json({
          ...aiResponse,
          data: {
            ...aiResponse.data,
            estimated_calories: Math.min(calories, 2000),
            confidence_range: whey
              ? "±10% (typical scoop)"
              : fat
                ? "±10% (typical)"
                : (apiNutrition.confidence_range ?? "±10%"),
            macros: { protein_g, carbs_g, fat_g },
          },
        });
      }
      // OFF data wrong for this query (e.g. 1 kcal for 5g butter) — fall through to Groq
    }

    // Sanitize AI calorie output so we never send absurd values (e.g. 320380)
    if (body.intent === "food_estimation" && aiResponse.data && typeof aiResponse.data === "object") {
      const data = aiResponse.data as Record<string, unknown>;
      const raw = data.estimated_calories ?? data.calories;
      const sane = sanitizeCalories(raw);
      let calories = sane != null ? sane : (typeof raw === "number" && Number.isFinite(raw) ? raw : 0);
      const foodText = body.food_text && typeof body.food_text === "string" ? body.food_text : "";
      const gramsOpt = (body.grams != null && body.grams > 0) ? body.grams : undefined;
      const whey = wheyOverride(foodText, calories, gramsOpt);
      const fat = fatOverride(foodText, calories, gramsOpt);
      if (whey) {
        aiResponse.data = {
          ...aiResponse.data,
          estimated_calories: whey.calories,
          confidence_range: "±10% (typical scoop)",
          macros: { protein_g: whey.protein_g, carbs_g: whey.carbs_g, fat_g: whey.fat_g },
        };
      } else if (fat) {
        aiResponse.data = {
          ...aiResponse.data,
          estimated_calories: fat.calories,
          confidence_range: "±10% (typical)",
          macros: { protein_g: fat.protein_g, carbs_g: fat.carbs_g, fat_g: fat.fat_g },
        };
      } else if (sane != null) {
        const effectiveG = (body.grams != null && body.grams > 0) ? body.grams : 100;
        const clamped = clampCaloriesByCategory(foodText, sane, effectiveG);
        aiResponse.data = { ...aiResponse.data, estimated_calories: clamped };
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
