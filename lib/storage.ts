import type { FoodLogEntry } from "./types";

const LOG_KEY = "macrofactor_food_log";

export function loadLog(): FoodLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FoodLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLog(log: FoodLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // ignore
  }
}

/** Get YYYY-MM-DD for a date */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type DayMacros = { date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

/** Calories per day for the last 7 days (including today) */
export function last7DaysCalories(log: FoodLogEntry[]): { date: string; calories: number }[] {
  return last7DaysMacros(log).map(({ date, calories }) => ({ date, calories }));
}

/** Full macros per day for the last 7 days */
export function last7DaysMacros(log: FoodLogEntry[]): DayMacros[] {
  const byDay: Record<string, DayMacros> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    byDay[key] = { date: key, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }
  for (const e of log) {
    const day = e.created_at.slice(0, 10);
    if (byDay[day]) {
      byDay[day].calories += e.estimated_calories;
      byDay[day].protein_g += e.macros?.protein_g ?? 0;
      byDay[day].carbs_g += e.macros?.carbs_g ?? 0;
      byDay[day].fat_g += e.macros?.fat_g ?? 0;
    }
  }
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}
