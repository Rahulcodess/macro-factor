/**
 * CalorieNinjas API — detailed nutrition from natural-language food queries.
 * https://api.calorieninjas.com/v1/nutrition
 * Uses env CALORIE_NINJAS_API_KEY (do not commit keys).
 */

const NUTRITION_URL = "https://api.calorieninjas.com/v1/nutrition";
const MAX_QUERY_LENGTH = 1500;

export type CalorieNinjasItem = {
  name: string;
  calories: number;
  protein_g: number;
  carbohydrates_total_g: number;
  fat_total_g: number;
  serving_size_g: number;
};

export type CalorieNinjasResult = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "calorieninjas";
  confidence_range: string;
  items: CalorieNinjasItem[];
};

function getApiKey(): string | undefined {
  return process.env.CALORIE_NINJAS_API_KEY?.trim() || undefined;
}

/**
 * Fetch nutrition for a food query. Supports quantities in the query (e.g. "3 eggs", "1lb chicken").
 * Returns aggregated totals from all items, or null if key missing, request fails, or no items.
 */
export async function getCalorieNinjasNutrition(
  query: string
): Promise<CalorieNinjasResult | null> {
  const key = getApiKey();
  if (!key) return null;

  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return null;

  try {
    const url = `${NUTRITION_URL}?query=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": key },
      next: { revalidate: 0 },
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { items?: CalorieNinjasItem[] };
    const items = json.items?.filter(
      (i) => i != null && Number.isFinite(i.calories)
    );
    if (!items?.length) return null;

    const calories = items.reduce((s, i) => s + (i.calories ?? 0), 0);
    const protein_g = items.reduce((s, i) => s + (i.protein_g ?? 0), 0);
    const carbs_g = items.reduce(
      (s, i) => s + (i.carbohydrates_total_g ?? 0),
      0
    );
    const fat_g = items.reduce((s, i) => s + (i.fat_total_g ?? 0), 0);

    return {
      calories: Math.round(calories * 10) / 10,
      protein_g: Math.round(protein_g * 10) / 10,
      carbs_g: Math.round(carbs_g * 10) / 10,
      fat_g: Math.round(fat_g * 10) / 10,
      source: "calorieninjas",
      confidence_range: "±10%",
      items,
    };
  } catch {
    return null;
  }
}
