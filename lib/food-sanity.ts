/**
 * Clamp calorie estimates to sane ranges by food category.
 * Stops random/wrong values from OFF or AI (e.g. 5000 kcal for rice, 10 kcal for eggs).
 */

/** Min and max kcal per 100g for a category. */
const CATEGORY_KCAL_PER_100G: Array<{
  pattern: RegExp;
  min: number;
  max: number;
}> = [
  { pattern: /\b(egg|eggs)\b/i, min: 130, max: 200 },
  { pattern: /\b(rice|chawal|biryani)\b/i, min: 100, max: 200 },
  { pattern: /\b(dal|lentil|curry|sambar)\b/i, min: 80, max: 180 },
  { pattern: /\b(chicken|murg|paneer|tofu)\b/i, min: 120, max: 280 },
  { pattern: /\b(roti|chapati|phulka|paratha|naan|bread)\b/i, min: 200, max: 380 },
  { pattern: /\b(milk|doodh)\b/i, min: 40, max: 70 },
  { pattern: /\b(banana|apple|fruit)\b/i, min: 50, max: 100 },
  { pattern: /\b(potato|aloo)\b/i, min: 60, max: 100 },
  { pattern: /\b(butter|ghee|oil)\b/i, min: 650, max: 900 },
  { pattern: /\b(whey|protein\s*powder)\b/i, min: 350, max: 450 },
  { pattern: /\b(vegetable|sabzi|curry)\b/i, min: 20, max: 120 },
  { pattern: /\b(fish|prawn|shrimp)\b/i, min: 80, max: 180 },
  { pattern: /\b(beef|mutton|lamb)\b/i, min: 150, max: 350 },
  { pattern: /\b(sugar|honey|jaggery)\b/i, min: 300, max: 400 },
  { pattern: /\b(nuts|almond|peanut|cashew)\b/i, min: 500, max: 650 },
  { pattern: /\b(curd|yogurt|dahi)\b/i, min: 50, max: 120 },
  { pattern: /\b(flour|atta|maida)\b/i, min: 330, max: 380 },
];

/** Default: anything not matched gets clamped to 30–500 kcal per 100g to catch obvious garbage. */
const DEFAULT_MIN_KCAL_PER_100 = 30;
const DEFAULT_MAX_KCAL_PER_100 = 500;

/**
 * Clamp calories to a sane range for the given food text and grams.
 * Uses grams to compute implied kcal/100g, then clamps to category or default range.
 */
export function clampCaloriesByCategory(
  foodText: string,
  calories: number,
  grams: number
): number {
  if (!Number.isFinite(calories) || calories <= 0) return calories;
  const effectiveG = grams > 0 ? grams : 100;
  const kcalPer100 = (calories / effectiveG) * 100;

  let minPer100 = DEFAULT_MIN_KCAL_PER_100;
  let maxPer100 = DEFAULT_MAX_KCAL_PER_100;

  for (const { pattern, min, max } of CATEGORY_KCAL_PER_100G) {
    if (pattern.test(foodText)) {
      minPer100 = min;
      maxPer100 = max;
      break;
    }
  }

  const clampedPer100 = Math.max(minPer100, Math.min(maxPer100, kcalPer100));
  return Math.round((clampedPer100 * effectiveG) / 100);
}
