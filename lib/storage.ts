import type { FoodLogEntry } from "./types";

export async function loadLog(): Promise<FoodLogEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    const user = getUser();
    if (!user?.id) return [];

    const res = await fetch("/api/food-logs", {
      headers: {
        Authorization: `Bearer ${user.id}`,
      },
    });

    const data = await res.json();
    return Array.isArray(data.logs) ? data.logs : [];
  } catch {
    return [];
  }
}

export async function saveLogEntry(entry: Omit<FoodLogEntry, "id" | "created_at">): Promise<FoodLogEntry | null> {
  if (typeof window === "undefined") return null;
  try {
    const user = getUser();
    if (!user?.id) return null;

    const res = await fetch("/api/food-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.id}`,
      },
      body: JSON.stringify(entry),
    });

    const data = await res.json();
    return data.ok ? data.entry : null;
  } catch {
    return null;
  }
}

export async function deleteLogEntry(id: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const user = getUser();
    if (!user?.id) return false;

    const res = await fetch(`/api/food-logs?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${user.id}`,
      },
    });

    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("macrofactor_auth_user");
    if (!raw) return null;
    return JSON.parse(raw) as { id: string; email: string; name: string; createdAt: string } | null;
  } catch {
    return null;
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
