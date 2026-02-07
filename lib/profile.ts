/**
 * User profile for personalized calorie and protein targets.
 * Stored in localStorage per user (key: macrofactor_profile_${userId}).
 */

export type ActivityLevel = "sedentary" | "moderate" | "active";
export type Goal = "fat_loss" | "muscle_gain" | "general_fitness";

export type Equipment = "gym" | "home" | "none";

export type UserProfile = {
  age: number;
  activity_level: ActivityLevel;
  weight_kg: number;
  height_cm: number;
  goal: Goal;
  gender: "male" | "female" | "other";
  equipment: Equipment;
};

const STORAGE_PREFIX = "macrofactor_profile_";

export function getProfileKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadProfile(userId: string | null): UserProfile | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(getProfileKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as UserProfile;
    if (p.age == null || p.activity_level == null || p.weight_kg == null || p.height_cm == null) return null;
    return {
      age: Number(p.age),
      activity_level: p.activity_level,
      weight_kg: Number(p.weight_kg),
      height_cm: Number(p.height_cm),
      goal: p.goal ?? "general_fitness",
      gender: p.gender ?? "other",
      equipment: p.equipment ?? "gym",
    };
  } catch {
    return null;
  }
}

export function saveProfile(userId: string, profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getProfileKey(userId), JSON.stringify(profile));
  } catch {
    // ignore
  }
}

/** Mifflin–St Jeor BMR (kcal/day) */
function bmr(weight_kg: number, height_cm: number, age: number, gender: UserProfile["gender"]): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  if (gender === "male") return base + 5;
  if (gender === "female") return base - 161;
  return base - 78; // other: midpoint
}

const ACTIVITY_MULT: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  moderate: 1.55,
  active: 1.725,
};

/** Protein per kg body weight by goal */
const PROTEIN_PER_KG: Record<Goal, number> = {
  fat_loss: 1.6,
  muscle_gain: 2.0,
  general_fitness: 1.4,
};

export type DailyTargets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const DEFAULT_TARGETS: DailyTargets = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

export function computeTargets(profile: UserProfile | null): DailyTargets {
  if (!profile || !Number.isFinite(profile.weight_kg) || profile.weight_kg <= 0) return DEFAULT_TARGETS;
  const bmrVal = bmr(
    profile.weight_kg,
    Number.isFinite(profile.height_cm) && profile.height_cm > 0 ? profile.height_cm : 170,
    Number.isFinite(profile.age) && profile.age > 0 ? profile.age : 30,
    profile.gender
  );
  const mult = ACTIVITY_MULT[profile.activity_level] ?? 1.55;
  let tdee = Math.round(bmrVal * mult);
  if (profile.goal === "fat_loss") tdee = Math.round(tdee * 0.85);
  else if (profile.goal === "muscle_gain") tdee = Math.round(tdee * 1.05);
  const kcal = Math.max(1200, Math.min(4000, tdee));
  const protein_g = Math.round(profile.weight_kg * (PROTEIN_PER_KG[profile.goal] ?? 1.4));
  const proteinKcal = protein_g * 4;
  const remaining = kcal - proteinKcal;
  const fat_g = Math.round((remaining * 0.3) / 9);
  const carbs_g = Math.round((remaining * 0.55) / 4);
  return {
    kcal,
    protein_g: Math.max(50, Math.min(250, protein_g)),
    carbs_g: Math.max(100, Math.min(400, carbs_g)),
    fat_g: Math.max(40, Math.min(120, fat_g)),
  };
}
