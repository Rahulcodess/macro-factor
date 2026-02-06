/**
 * FREE nutrition data — Open Food Facts API (no key required).
 * Used to enrich AI estimates with real product data when available.
 * Rate limits: ~10 search/min, ~100 product/min — cache in production.
 */

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product";

export type OFFProduct = {
  product_name?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
  quantity?: string;
};

export type NutritionEstimate = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "api" | "ai_fallback";
  confidence_range?: string;
};

/**
 * Search Open Food Facts and return first result's nutrition per 100g.
 * Returns null if no result or API error (caller can fall back to AI).
 */
export async function searchNutrition(
  query: string,
  limit = 3
): Promise<NutritionEstimate | null> {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: String(limit),
    });
    const res = await fetch(`${OFF_SEARCH}?${params}`, {
      headers: { "User-Agent": "Macrofactor/1.0 (Hackathon)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { products?: OFFProduct[] };
    const products = json.products?.filter(
      (p) => p.nutriments?.["energy-kcal_100g"] != null
    );
    if (!products?.length) return null;
    const p = products[0];
    const nut = p.nutriments ?? {};
    const kcal = nut["energy-kcal_100g"] ?? 0;
    return {
      calories: Math.round(kcal),
      protein_g: Math.round((nut.proteins_100g ?? 0) * 10) / 10,
      carbs_g: Math.round((nut.carbohydrates_100g ?? 0) * 10) / 10,
      fat_g: Math.round((nut.fat_100g ?? 0) * 10) / 10,
      source: "api",
      confidence_range: "±10%",
    };
  } catch {
    return null;
  }
}

/**
 * Get product by barcode (optional — for future scan feature).
 */
export async function getProductByBarcode(
  barcode: string
): Promise<NutritionEstimate | null> {
  try {
    const res = await fetch(`${OFF_PRODUCT}/${barcode}.json`, {
      headers: { "User-Agent": "Macrofactor/1.0 (Hackathon)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { product?: OFFProduct };
    const p = json.product;
    if (!p?.nutriments || p.nutriments["energy-kcal_100g"] == null) return null;
    const nut = p.nutriments;
    return {
      calories: Math.round(nut["energy-kcal_100g"] ?? 0),
      protein_g: Math.round((nut.proteins_100g ?? 0) * 10) / 10,
      carbs_g: Math.round((nut.carbohydrates_100g ?? 0) * 10) / 10,
      fat_g: Math.round((nut.fat_100g ?? 0) * 10) / 10,
      source: "api",
      confidence_range: "±10%",
    };
  } catch {
    return null;
  }
}
