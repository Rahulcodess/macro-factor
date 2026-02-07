import type { FoodLogEntry } from "./types";

export type LoadLogResult = { logs: FoodLogEntry[]; error?: boolean };

export async function loadLog(): Promise<LoadLogResult> {
  if (typeof window === "undefined") return { logs: [] };
  try {
    const user = getUser();
    if (!user?.id) return { logs: [] };

    const res = await fetch("/api/food-logs", {
      headers: { Authorization: `Bearer ${user.id}` },
    });
    const data = await res.json();
    const logs = Array.isArray(data.logs) ? data.logs : [];
    return res.ok ? { logs } : { logs, error: true };
  } catch {
    return { logs: [], error: true };
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

/** Get YYYY-MM-DD in UTC (for storage/API) */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get YYYY-MM-DD in local time (for "today" and charts so they match user's day) */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Get local date string from an ISO timestamp */
export function entryLocalDate(createdAt: string): string {
  return localDateKey(new Date(createdAt));
}

export type DayMacros = { date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

/** Calories per day for the last 7 days (including today), using local dates */
export function last7DaysCalories(log: FoodLogEntry[]): { date: string; calories: number }[] {
  return last7DaysMacros(log).map(({ date, calories }) => ({ date, calories }));
}

/** Full macros per day for the last 7 days, grouped by local date */
export function last7DaysMacros(log: FoodLogEntry[]): DayMacros[] {
  const byDay: Record<string, DayMacros> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    byDay[key] = { date: key, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }
  const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  for (const e of log) {
    const day = entryLocalDate(e.created_at);
    if (byDay[day]) {
      byDay[day].calories += Number.isFinite(e.estimated_calories) ? e.estimated_calories : 0;
      byDay[day].protein_g += num(e.macros?.protein_g);
      byDay[day].carbs_g += num(e.macros?.carbs_g);
      byDay[day].fat_g += num(e.macros?.fat_g);
    }
  }
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}
