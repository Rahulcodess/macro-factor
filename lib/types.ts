/**
 * AROMI request/response types — single cohesive app.
 */

export type UserContext = {
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: "sedentary" | "moderate" | "active";
  goal: "fat_loss" | "muscle_gain" | "general_fitness";
  diet: "vegetarian" | "vegan" | "non-vegetarian";
  gender: "male" | "female" | "other";
  health_conditions: string[];
  injuries: string[];
  equipment: "home" | "gym" | "none";
};

export type AromiIntent =
  | "food_estimation"
  | "food_log"
  | "workout_plan"
  | "adjust_plan"
  | "general_chat";

export type AromiRequest = {
  intent: AromiIntent;
  food_text?: string | null;
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | null;
  /** Weight in grams (optional, for better calorie estimate) */
  grams?: number | null;
  user_context: UserContext;
  /** For adjust_plan or follow-up */
  previous_plan?: unknown;
};

export type AromiResponse = {
  response_type: "food_estimation" | "food_log" | "workout_plan" | "message";
  message: string;
  data: Record<string, unknown>;
  ui_hint: "show_confirm_button" | "show_edit" | "show_workout" | "chat_only";
};

export type Macros = { protein_g: number; carbs_g: number; fat_g: number };

export type FoodLogEntry = {
  id: string;
  food_text: string;
  meal_type: string;
  estimated_calories: number;
  /** Weight in grams, if user specified */
  grams?: number;
  confidence_range?: string;
  macros?: Macros;
  created_at: string;
};
