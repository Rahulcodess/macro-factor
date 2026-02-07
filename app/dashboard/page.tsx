"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AromiRequest, AromiResponse, UserContext, FoodLogEntry, Macros } from "@/lib/types";
import { loadLog, saveLogEntry, deleteLogEntry, last7DaysCalories, last7DaysMacros, localDateKey, entryLocalDate } from "@/lib/storage";
import { getUser, logout as logoutLocal } from "@/lib/auth";
import { loadProfile, saveProfile, computeTargets, type UserProfile, type ActivityLevel, type Goal, type Equipment } from "@/lib/profile";

/** Max sane kcal per serving; above this we assume wrong unit or garbage. */
const MAX_KCAL_PER_SERVING = 2000;

function extractEstimatedCalories(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;

  const tryNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const s = value.trim();
      const rangeMatch = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
      if (rangeMatch) {
        const low = Number(rangeMatch[1]);
        const high = Number(rangeMatch[2]);
        if (Number.isFinite(low) && Number.isFinite(high)) return Math.round((low + high) / 2);
      }
      const n = Number(s.replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const directKeys = ["estimated_calories", "calories", "kcal"] as const;
  for (const key of directKeys) {
    if (key in data) {
      let n = tryNumber((data as Record<string, unknown>)[key]);
      if (n != null) {
        n = sanitizeCalories(n);
        if (n != null) return n;
      }
    }
  }

  const nested = (data as Record<string, unknown>).nutrition;
  if (nested && typeof nested === "object") {
    for (const key of directKeys) {
      let n = tryNumber((nested as Record<string, unknown>)[key]);
      if (n != null) {
        n = sanitizeCalories(n);
        if (n != null) return n;
      }
    }
  }

  return null;
}

/** Treat huge numbers as joules (convert to kcal) or cap garbage. */
function sanitizeCalories(raw: number): number | null {
  if (raw <= 0 || !Number.isFinite(raw)) return null;
  // Likely in joules (e.g. 570720 J = ~136 kcal). 1 kcal ≈ 4184 J.
  if (raw > MAX_KCAL_PER_SERVING && raw < 500_000) {
    const asKcal = Math.round(raw / 4184);
    return asKcal <= MAX_KCAL_PER_SERVING ? asKcal : MAX_KCAL_PER_SERVING;
  }
  if (raw > MAX_KCAL_PER_SERVING) return MAX_KCAL_PER_SERVING;
  return Math.round(raw);
}

/** Cap obviously wrong estimates for common Indian breads (e.g. 2 chapati ~120–160 kcal). */
function capChapatiRotiCalories(foodText: string, calories: number): number {
  if (!/\b(chapati|chappati|roti|phulka|paratha)\b/i.test(foodText)) return calories;
  const match = foodText.match(/(\d+)\s*(piece|pc|pcs|no|number)?/i) || foodText.match(/^(\d+)/);
  const pieces = match ? Math.min(10, Math.max(1, parseInt(match[1], 10))) : 2;
  const maxPerPiece = 90;
  const capped = Math.min(calories, pieces * maxPerPiece);
  return capped;
}

/** Cap absurd egg estimates (e.g. 2 eggs ~140–160 kcal, not 644). */
function capEggCalories(foodText: string, calories: number): number {
  if (!/\b(egg|eggs)\b/i.test(foodText)) return calories;
  const match = foodText.match(/(\d+)\s*(egg|eggs)?/i) || foodText.match(/^(\d+)/);
  const count = match ? Math.min(20, Math.max(1, parseInt(match[1], 10))) : 1;
  const maxPerEgg = 90;
  return Math.min(calories, count * maxPerEgg);
}

/** Floor for whey/protein powder (1 scoop ≈ 100–120 kcal; avoid 29 kcal from bad API). */
function floorWheyCalories(foodText: string, calories: number): number {
  if (!/\b(whey|protein\s*powder|scoop|schoop)\b/i.test(foodText)) return calories;
  const match = foodText.match(/(\d+)\s*(scoop|schoop|scoops)?/i) || foodText.match(/^(\d+)/);
  const scoops = match ? Math.min(5, Math.max(1, parseInt(match[1], 10))) : 1;
  const minPerScoop = 100;
  return Math.max(calories, scoops * minPerScoop);
}

/** Format macro for display: number → "Xg", string (e.g. "12-14g") → as-is to avoid "gg". */
function formatMacroValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.round(value)}g`;
  if (typeof value === "string") return value.trim();
  return "—";
}

/** Parse grams from text e.g. "5g butter". */
function parseGramsFromFoodText(foodText: string): number | undefined {
  const m = foodText.match(/(\d+)\s*g\b/i) || foodText.match(/\b(\d+)\s*grams?\b/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return n > 0 && n <= 1000 ? n : undefined;
}

/** Floor for butter/oil (e.g. 5g butter ≈ 36 kcal, not 1). */
function floorButterOilCalories(foodText: string, calories: number, grams?: number): number {
  const g = (grams && grams > 0) ? grams : parseGramsFromFoodText(foodText);
  if (!g) return calories;
  if (!/\b(butter|ghee|oil|amul|refined)\b/i.test(foodText)) return calories;
  const kcalPerGram = /\b(oil|refined|mustard|olive)\b/i.test(foodText) ? 9 : 7.2;
  const minCal = Math.round(g * kcalPerGram * 0.8);
  return Math.max(calories, minCal);
}

/** Floor for eggs (e.g. 2 eggs ≈ 140 kcal min). */
function floorEggCalories(foodText: string, calories: number): number {
  if (!/\b(egg|eggs)\b/i.test(foodText)) return calories;
  const match = foodText.match(/(\d+)\s*(egg|eggs)?/i) || foodText.match(/^(\d+)/);
  const count = match ? Math.min(20, Math.max(1, parseInt(match[1], 10))) : 1;
  const minPerEgg = 70;
  return Math.max(calories, count * minPerEgg);
}

/** When text has both eggs and oil, floor = egg_min + oil_min so combined items are sane. */
function combinedEggOilFloor(foodText: string, calories: number, grams?: number): number {
  const hasEgg = /\b(egg|eggs)\b/i.test(foodText);
  const hasOil = /\b(butter|ghee|oil|amul|refined)\b/i.test(foodText);
  if (!hasEgg || !hasOil) return calories;
  const eggMatch = foodText.match(/(\d+)\s*(egg|eggs)?/i) || foodText.match(/^(\d+)/);
  const eggCount = eggMatch ? Math.min(20, Math.max(1, parseInt(eggMatch[1], 10))) : 1;
  const oilG = (grams && grams > 0) ? grams : parseGramsFromFoodText(foodText);
  const oilMin = oilG ? Math.round(oilG * 7 * 0.8) : 0;
  const combinedMin = eggCount * 70 + oilMin;
  return Math.max(calories, combinedMin);
}

/** Apply all food-specific caps/floors so displayed/saved calories are sane. */
function capFoodCalories(foodText: string, calories: number, grams?: number): number {
  let out = calories;
  out = floorWheyCalories(foodText, out);
  out = combinedEggOilFloor(foodText, out, grams);
  out = floorButterOilCalories(foodText, out, grams);
  out = floorEggCalories(foodText, out);
  out = capChapatiRotiCalories(foodText, out);
  out = capEggCalories(foodText, out);
  return out;
}

const DEFAULT_CONTEXT: UserContext = {
  age: 25,
  height_cm: 175,
  weight_kg: 72,
  activity_level: "moderate",
  goal: "fat_loss",
  diet: "vegetarian",
  gender: "other",
  health_conditions: [],
  injuries: [],
  equipment: "gym",
};

type Tab = "dashboard" | "log" | "chat" | "workout";

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack">("lunch");
  const [grams, setGrams] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<AromiResponse | null>(null);
  const [log, setLog] = useState<FoodLogEntry[]>([]);
  const [pendingLog, setPendingLog] = useState<{
    food_text: string;
    meal_type: string;
    estimated_calories: number;
    grams?: number;
    confidence_range?: string;
    macros?: Macros;
  } | null>(null);

  // Workout profile (used to optimize plan)
  // Log loading & feedback
  const [logLoading, setLogLoading] = useState(true);
  const [logLoadError, setLogLoadError] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<"added" | "error" | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultProfile: UserProfile = {
    age: 25,
    activity_level: "moderate",
    weight_kg: 70,
    height_cm: 170,
    goal: "general_fitness",
    gender: "other",
    equipment: "gym",
  };
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(defaultProfile);
  const [profileSaved, setProfileSaved] = useState(false);

  const targets = computeTargets(profile ?? profileDraft);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login?next=/dashboard");
      return;
    }
    setUserEmail(u.email);
    const loaded = loadProfile(u.id);
    if (loaded) {
      setProfile(loaded);
      setProfileDraft(loaded);
    }
  }, [router]);

  const handleSaveProfile = useCallback(() => {
    const u = getUser();
    if (!u) return;
    saveProfile(u.id, profileDraft);
    setProfile(profileDraft);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }, [profileDraft]);

  const refetchLog = useCallback(() => {
    setLogLoading(true);
    setLogLoadError(false);
    loadLog().then(({ logs, error }) => {
      setLog(logs);
      setLogLoadError(error ?? false);
      setLogLoading(false);
    });
  }, []);

  useEffect(() => {
    refetchLog();
  }, [refetchLog]);


  useEffect(() => {
    if (saveFeedback == null) return;
    const t = setTimeout(() => setSaveFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [saveFeedback]);

  const addToLog = useCallback(async (entry: Omit<FoodLogEntry, "id" | "created_at">) => {
    const tempId = crypto.randomUUID();
    const tempCreated = new Date().toISOString();
    const optimistic: FoodLogEntry = { ...entry, id: tempId, created_at: tempCreated };
    setLog((prev) => [optimistic, ...prev]);
    setSaving(true);
    setSaveFeedback(null);
    const saved = await saveLogEntry(entry);
    setSaving(false);
    if (saved) {
      setLog((prev) => prev.map((e) => (e.id === tempId ? saved : e)));
      setSaveFeedback("added");
      refetchLog();
    } else {
      setSaveFeedback("error");
    }
  }, [refetchLog]);

  const removeFromLog = useCallback(async (id: string) => {
    const deleted = await deleteLogEntry(id);
    if (deleted) {
      setLog((prev) => prev.filter((e) => e.id !== id));
    }
  }, []);

  const send = useCallback(
    async (intent: AromiRequest["intent"], extra?: Partial<AromiRequest>) => {
      setLoading(true);
      setLastResponse(null);
      setPendingLog(null);
      try {
        const gramsNum = grams.trim() ? parseInt(grams.trim(), 10) : undefined;
        const body: AromiRequest = {
          intent,
          food_text:
            intent === "food_estimation" || intent === "food_log"
              ? input
              : intent === "adjust_plan"
                ? input
                : undefined,
          meal_type: intent === "food_estimation" || intent === "food_log" ? mealType : undefined,
          grams: gramsNum != null && !Number.isNaN(gramsNum) && gramsNum > 0 ? gramsNum : undefined,
          user_context: DEFAULT_CONTEXT,
          ...extra,
        };
        const res = await fetch("/api/aromi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as AromiResponse;
        setLastResponse(data);
        const cal = extractEstimatedCalories(data.data as Record<string, unknown> | undefined);
        if (cal != null && Number.isFinite(cal) && (intent === "food_estimation" || intent === "food_log")) {
          const gramsNum = grams.trim() ? parseInt(grams.trim(), 10) : undefined;
          const cappedCal = capFoodCalories(intent === "food_estimation" || intent === "food_log" ? input : "", cal, gramsNum);
          setPendingLog({
            food_text: (intent === "food_estimation" || intent === "food_log" ? input : "") || "Logged food",
            meal_type: mealType,
            estimated_calories: cappedCal,
            grams: gramsNum != null && !Number.isNaN(gramsNum) ? gramsNum : undefined,
            confidence_range: data.data?.confidence_range as string | undefined,
            macros: data.data?.macros as Macros | undefined,
          });
        }
        return data;
      } catch {
        setLastResponse({
          response_type: "message",
          message: "Something went wrong. Check your connection and try again.",
          data: {},
          ui_hint: "chat_only",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [input, mealType, grams]
  );

  const handleConfirmLog = useCallback(async () => {
    if (!pendingLog) return;
    await addToLog({
      food_text: pendingLog.food_text,
      meal_type: pendingLog.meal_type,
      estimated_calories: pendingLog.estimated_calories,
      grams: pendingLog.grams,
      confidence_range: pendingLog.confidence_range,
      macros: pendingLog.macros,
    });
    setPendingLog(null);
    setLastResponse(null);
    setInput("");
    setGrams("");
  }, [pendingLog, addToLog]);

  const activeProfile = profile ?? profileDraft;
  const workoutContext = useCallback(
    (): UserContext => ({
      ...DEFAULT_CONTEXT,
      age: activeProfile.age,
      activity_level: activeProfile.activity_level,
      gender: activeProfile.gender,
      goal: activeProfile.goal,
      equipment: activeProfile.equipment,
    }),
    [activeProfile.age, activeProfile.activity_level, activeProfile.gender, activeProfile.goal, activeProfile.equipment]
  );

  const [workoutAdjustInput, setWorkoutAdjustInput] = useState("");

  const handleGenerateWorkout = useCallback(() => {
    send("workout_plan", { user_context: workoutContext() });
  }, [send, workoutContext]);

  const handleAdjustPlan = useCallback(() => {
    if (!workoutAdjustInput.trim()) return;
    send("adjust_plan", { user_context: workoutContext(), food_text: workoutAdjustInput });
  }, [workoutAdjustInput, send, workoutContext]);

  const d = lastResponse?.data;
  const estimatedCaloriesValue = extractEstimatedCalories(d as Record<string, unknown> | undefined);
  const gramsNum = grams.trim() ? parseInt(grams.trim(), 10) : undefined;
  const displayCalories =
    estimatedCaloriesValue != null && Number.isFinite(estimatedCaloriesValue)
      ? Math.min(MAX_KCAL_PER_SERVING, capFoodCalories(input, estimatedCaloriesValue, Number.isFinite(gramsNum) ? gramsNum : undefined))
      : null;
  const hasCalories = displayCalories != null;
  const showConfirm = hasCalories && pendingLog;
  const showWorkout = lastResponse?.ui_hint === "show_workout" && d?.days != null;

  const todayKey = localDateKey(new Date());
  const todayEntries = log.filter((e) => entryLocalDate(e.created_at) === todayKey);
  const todayKcal = todayEntries.reduce(
    (s, e) => s + (Number.isFinite(e.estimated_calories) ? e.estimated_calories : 0),
    0
  );
  const toNum = (x: unknown): number => {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  const todayMacrosRaw = todayEntries.reduce(
    (acc, e) => ({
      protein_g: acc.protein_g + toNum(e.macros?.protein_g),
      carbs_g: acc.carbs_g + toNum(e.macros?.carbs_g),
      fat_g: acc.fat_g + toNum(e.macros?.fat_g),
    }),
    { protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  const todayMacros = {
    protein_g: toNum(todayMacrosRaw.protein_g),
    carbs_g: toNum(todayMacrosRaw.carbs_g),
    fat_g: toNum(todayMacrosRaw.fat_g),
  };
  const safeMacro = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);
  const safeKcal = Number.isFinite(todayKcal) ? todayKcal : 0;
  const sevenDays = last7DaysCalories(log);
  const sevenDaysMacros = last7DaysMacros(log);
  const avg7DayKcal = sevenDays.length
    ? Math.round(sevenDays.reduce((s, x) => s + x.calories, 0) / sevenDays.length)
    : 0;
  const total7DayKcal = sevenDays.reduce((s, x) => s + x.calories, 0);

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard" },
    { id: "log" as const, label: "Food" },
    { id: "chat" as const, label: "AROMI" },
    { id: "workout" as const, label: "Workout" },
  ];

  return (
    <div className="min-h-screen bg-surface text-white flex flex-col font-sans">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-white">Macrofactor</h1>
            <span className="text-xs font-medium text-accent bg-accent/15 px-2.5 py-1 rounded-md border border-accent/30">
              AROMI
            </span>
          </div>

          <div className="flex items-center gap-2">
            {userEmail ? (
              <>
                <span className="hidden sm:inline text-xs text-muted truncate max-w-[220px]">{userEmail}</span>
                <button
                  onClick={() => {
                    logoutLocal();
                    router.push("/");
                  }}
                  className="px-3 py-2 rounded-lg bg-surface3 border border-border text-gray-200 text-sm font-medium hover:border-accent/50 hover:text-accent"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/login?next=/dashboard"
                className="px-3 py-2 rounded-lg bg-surface3 border border-border text-gray-200 text-sm font-medium hover:border-accent/50 hover:text-accent"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav className="sticky top-14 z-10 border-b border-border bg-surface2/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-surface3 rounded-xl flex-1">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 py-2.5 px-3 text-sm font-medium rounded-lg transition-all ${
                    tab === id ? "bg-surface3 text-white shadow-sm" : "text-muted hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "dashboard" && (
              <button
                type="button"
                onClick={() => document.getElementById("profile-for-calorie-estimate")?.scrollIntoView({ behavior: "smooth" })}
                className="shrink-0 py-2 px-3 text-xs font-medium text-accent border border-accent/50 rounded-lg hover:bg-accent/10"
              >
                Set your details
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-10 flex flex-col gap-8">
        {logLoadError && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Couldn&apos;t load your log. <button type="button" onClick={refetchLog} className="underline font-medium">Try again</button>
          </div>
        )}

        {saveFeedback === "added" && (
          <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Added to log.
          </div>
        )}
        {saveFeedback === "error" && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Couldn&apos;t save. Check your connection and try again.
          </div>
        )}

        {tab === "dashboard" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">Overview</h2>

            <section id="profile-for-calorie-estimate" className="bg-surface2 border border-border rounded-xl shadow-sm p-5 border-accent/30">
              <h3 className="text-sm font-medium text-accent uppercase tracking-wider mb-1">Your details for calorie estimate</h3>
              <p className="text-muted text-xs mb-4">Enter age, activity, weight, height and goal below. We use this to set your daily calorie and protein targets.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Age</label>
                  <input
                    type="number"
                    min={13}
                    max={120}
                    value={profileDraft.age}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setProfileDraft((p) => ({ ...p, age: Math.max(13, Math.min(120, v)) }));
                    }}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Activity</label>
                  <select
                    value={profileDraft.activity_level}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, activity_level: e.target.value as ActivityLevel }))}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  >
                    <option value="sedentary">Sedentary</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Weight (kg)</label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    step={0.5}
                    value={profileDraft.weight_kg}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isNaN(v)) setProfileDraft((p) => ({ ...p, weight_kg: Math.max(30, Math.min(300, v)) }));
                    }}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Height (cm)</label>
                  <input
                    type="number"
                    min={100}
                    max={250}
                    value={profileDraft.height_cm}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setProfileDraft((p) => ({ ...p, height_cm: Math.max(100, Math.min(250, v)) }));
                    }}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Goal</label>
                  <select
                    value={profileDraft.goal}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, goal: e.target.value as Goal }))}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  >
                    <option value="general_fitness">General fitness</option>
                    <option value="fat_loss">Fat loss</option>
                    <option value="muscle_gain">Muscle gain</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Gender</label>
                  <select
                    value={profileDraft.gender}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, gender: e.target.value as UserProfile["gender"] }))}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Equipment</label>
                  <select
                    value={profileDraft.equipment}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, equipment: e.target.value as Equipment }))}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  >
                    <option value="gym">Gym</option>
                    <option value="home">Home</option>
                    <option value="none">No equipment</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="w-full px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim"
                  >
                    {profileSaved ? "Saved" : "Save profile"}
                  </button>
                </div>
              </div>
              <p className="text-muted text-xs mt-3">Used for: daily calorie & protein targets (Food/Dashboard) and workout plans (Workout tab). Targets: {targets.kcal} kcal · {targets.protein_g}g protein · {targets.fat_g}g fat · {targets.carbs_g}g carbs</p>
            </section>

            {!logLoading && todayEntries.length === 0 && total7DayKcal === 0 && (
              <section className="bg-surface2 border border-border rounded-xl shadow-sm p-6 text-center">
                <p className="text-muted text-sm mb-4">Your dashboard will show your intake and trends here.</p>
                <p className="text-accent/90 text-xs mb-4">↑ Set your age, activity, weight & goal in the section above for personalized calorie and protein targets.</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <button type="button" onClick={() => setTab("log")} className="px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim">
                    Log your first meal
                  </button>
                  <button type="button" onClick={refetchLog} disabled={logLoading} className="px-4 py-2.5 rounded-lg bg-surface3 border border-border text-gray-200 text-sm font-medium hover:border-accent/50 hover:text-accent disabled:opacity-50">
                    Refresh
                  </button>
                </div>
                <p className="text-muted text-xs mt-4">If you added food but don&apos;t see it, try Refresh or log out and log back in.</p>
              </section>
            )}

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-medium text-muted uppercase tracking-wider">Intake last 7 days</h3>
                <button type="button" onClick={refetchLog} disabled={logLoading} className="text-xs text-muted hover:text-accent disabled:opacity-50 shrink-0">Refresh</button>
              </div>
              <div className="h-32 w-full min-h-[8rem] flex items-center justify-center">
                {total7DayKcal === 0 ? (
                  <p className="text-muted text-sm text-center px-4">Log food in the Food tab to see your trend here.</p>
                ) : sevenDays.length > 0 ? (() => {
                  const w = 280;
                  const h = 96;
                  const pad = { t: 4, r: 8, b: 20, l: 32 };
                  const x = (i: number) =>
                    pad.l + (i / Math.max(1, sevenDays.length - 1)) * (w - pad.l - pad.r);
                  const max = Math.max(1, ...sevenDays.map((dd) => dd.calories));
                  const y = (cal: number) =>
                    pad.t + h - pad.t - pad.b - (cal / max) * (h - pad.t - pad.b);
                  const points = sevenDays.map((dd, i) => `${x(i)},${y(dd.calories)}`).join(" ");
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                      <line
                        x1={pad.l}
                        y1={h - pad.b}
                        x2={w - pad.r}
                        y2={h - pad.b}
                        stroke="currentColor"
                        strokeOpacity={0.2}
                        strokeWidth={0.5}
                      />
                      <polyline
                        fill="none"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={points}
                      />
                      {sevenDays.map((dd, i) => (
                        <circle key={dd.date} cx={x(i)} cy={y(dd.calories)} r={3} fill="#f97316" />
                      ))}
                    </svg>
                  );
                })() : null}
              </div>
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                <span className="text-muted text-sm">Total</span>
                <span className="text-lg font-semibold text-white">{total7DayKcal} kcal</span>
              </div>
              {sevenDays.length > 0 && <p className="text-muted text-xs mt-1">Average {avg7DayKcal} kcal/day</p>}
            </section>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">Daily nutrition</h3>
              <div className="grid grid-cols-7 gap-2">
                {sevenDaysMacros.map((day) => (
                  <div key={day.date} className="flex flex-col gap-0.5">
                    <div className="flex flex-col gap-px rounded-lg overflow-hidden bg-surface3">
                      <div
                        className="bg-blue-500/95 text-[10px] font-medium text-center text-white py-1 px-0.5 truncate"
                        title={`${day.calories} kcal`}
                      >
                        {day.calories || "—"}
                      </div>
                      <div className="bg-orange-500/95 text-[10px] text-center text-white py-1">
                        {Number.isFinite(day.protein_g) ? Math.round(day.protein_g) : "—"} P
                      </div>
                      <div className="bg-amber-400/95 text-[10px] text-center text-gray-900 py-1">
                        {Number.isFinite(day.fat_g) ? Math.round(day.fat_g) : "—"} F
                      </div>
                      <div className="bg-emerald-500/95 text-[10px] text-center text-white py-1">
                        {Number.isFinite(day.carbs_g) ? Math.round(day.carbs_g) : "—"} C
                      </div>
                    </div>
                    <span className="text-[11px] text-muted text-center mt-1.5">
                      {day.date === todayKey
                        ? "Today"
                        : new Date(day.date).toLocaleDateString("en", { weekday: "narrow" })}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-muted text-xs mt-3">Kcal · Protein · Fat · Carbs</p>
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
                <p className="text-muted text-xs uppercase tracking-wider mb-2">Today</p>
                <p className="text-3xl font-bold text-white tabular-nums">{safeKcal}</p>
                <p className="text-muted text-sm mt-0.5">of {targets.kcal} kcal</p>
                <div className="mt-3 h-2 bg-surface3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.min(100, (safeKcal / targets.kcal) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
                <p className="text-muted text-xs uppercase tracking-wider mb-2">Macros</p>
                <p className="text-lg font-semibold text-white tabular-nums">
                  {safeMacro(todayMacros.protein_g)}
                  <span className="text-muted font-normal text-sm"> / {targets.protein_g}</span> P
                </p>
                <p className="text-sm text-muted mt-1">
                  {safeMacro(todayMacros.fat_g)}F · {safeMacro(todayMacros.carbs_g)}C
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">Recent</h3>
              {logLoading ? (
                <p className="text-muted text-sm py-4 text-center">Loading…</p>
              ) : todayEntries.length === 0 ? (
                <p className="text-muted text-sm py-4 text-center">No food logged today. Go to Food to log.</p>
              ) : (
                <ul className="bg-surface2 border border-border rounded-xl shadow-sm divide-y divide-border overflow-hidden">
                  {todayEntries.slice(-5).reverse().map((entry) => (
                    <li key={entry.id} className="flex justify-between items-center px-4 py-3">
                      <span className="text-white text-sm truncate">{entry.food_text}</span>
                      <span className="text-accent font-medium text-sm shrink-0 ml-3">~{entry.estimated_calories} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "log" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">Food</h2>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Calories</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {safeKcal}
                    <span className="text-muted font-normal">/{targets.kcal}</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Protein</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {safeMacro(todayMacros.protein_g)}
                    <span className="text-muted font-normal">/{targets.protein_g}g</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Fat</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {safeMacro(todayMacros.fat_g)}
                    <span className="text-muted font-normal">/{targets.fat_g}g</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Carbs</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {safeMacro(todayMacros.carbs_g)}
                    <span className="text-muted font-normal">/{targets.carbs_g}g</span>
                  </p>
                </div>
              </div>
            </section>

            {todayEntries.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">Quick add</h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[...new Map(todayEntries.map((e) => [e.food_text, e])).values()].slice(0, 5).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={async () => {
                        await addToLog({
                          food_text: entry.food_text,
                          meal_type: entry.meal_type,
                          estimated_calories: entry.estimated_calories,
                          grams: entry.grams,
                          confidence_range: entry.confidence_range,
                          macros: entry.macros,
                        });
                      }}
                      className="shrink-0 flex items-center gap-2 bg-surface2 border border-border rounded-xl shadow-sm px-4 py-2.5 text-sm text-white hover:border-accent/50 hover:text-accent transition-colors"
                    >
                      <span className="truncate max-w-[100px]">{entry.food_text}</span>
                      <span className="text-accent">+</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">Log food</h3>
              <p className="text-muted text-xs mb-4">Enter food and grams, click <strong className="text-gray-300">Log foods</strong> to estimate. Then click <strong className="text-gray-300">Add to log</strong> to save and update your dashboard.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Meal</label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as typeof mealType)}
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">Food</label>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g. 2 rotis, paneer butter masala"
                    className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-muted mb-1.5">Grams (optional)</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={grams}
                      onChange={(e) => setGrams(e.target.value)}
                      placeholder="—"
                      className="w-full px-3 py-2.5 text-sm text-center text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
                      aria-label="Grams"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => input.trim() && send("food_estimation")}
                      disabled={loading || !input.trim()}
                      className="px-6 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim disabled:opacity-50 transition-colors"
                    >
                      {loading ? "…" : "Log foods"}
                    </button>
                  </div>
                </div>
              </div>
              {lastResponse && tab === "log" && hasCalories && (
                <div className="mt-4 p-4 bg-surface3 rounded-lg border border-border">
                  <p className="text-gray-200 text-sm">{lastResponse.message}</p>
                  <p className="text-accent font-semibold mt-2">~{displayCalories} kcal</p>
                    <button
                    disabled={saving}
                    onClick={async () => {
                      const rawCal = displayCalories ?? extractEstimatedCalories(d as Record<string, unknown>);
                      const cal = rawCal != null ? capFoodCalories(input, rawCal, grams.trim() ? parseInt(grams.trim(), 10) : undefined) : null;
                      if (cal == null || !Number.isFinite(cal)) return;
                      const gramsNum = grams.trim() ? parseInt(grams.trim(), 10) : undefined;
                      const entry = pendingLog ?? {
                        food_text: input,
                        meal_type: mealType,
                        estimated_calories: cal,
                        grams: gramsNum != null && !Number.isNaN(gramsNum) ? gramsNum : undefined,
                        confidence_range: d!.confidence_range as string | undefined,
                        macros: d!.macros as Macros | undefined,
                      };
                      await addToLog({
                        food_text: entry.food_text,
                        meal_type: entry.meal_type,
                        estimated_calories: entry.estimated_calories,
                        grams: entry.grams,
                        confidence_range: entry.confidence_range,
                        macros: entry.macros,
                      });
                      setPendingLog(null);
                      setLastResponse(null);
                      setInput("");
                      setGrams("");
                    }}
                    className="mt-3 w-full py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim disabled:opacity-50"
                  >
                    {saving ? "Adding…" : "Add to log"}
                  </button>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">Today&apos;s log</h3>
              {logLoading ? (
                <p className="text-muted text-sm py-6 text-center bg-surface2 border border-border rounded-xl shadow-sm">Loading…</p>
              ) : todayEntries.length === 0 ? (
                <p className="text-muted text-sm py-6 text-center bg-surface2 border border-border rounded-xl shadow-sm">
                  No entries yet. Log food above.
                </p>
              ) : (
                <ul className="bg-surface2 border border-border rounded-xl shadow-sm divide-y divide-border overflow-hidden">
                  {todayEntries.map((entry) => (
                    <li key={entry.id} className="flex justify-between items-center px-4 py-3">
                      <div className="min-w-0">
                        <span className="text-white">{entry.food_text}</span>
                        {entry.grams != null ? <span className="text-muted text-sm ml-1">{entry.grams}g</span> : null}
                        <span className="text-muted text-sm ml-2">· {entry.meal_type}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-accent font-semibold tabular-nums">~{entry.estimated_calories}</span>
                        <button
                          onClick={async () => {
                            await removeFromLog(entry.id);
                          }}
                          className="text-muted hover:text-red-400 text-lg leading-none w-6 h-6 flex items-center justify-center rounded"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {todayEntries.length > 0 && <p className="text-muted text-sm mt-3">Total ~{safeKcal} kcal</p>}
            </section>
          </div>
        )}

        {tab === "chat" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">AROMI</h2>
            <p className="text-muted text-sm">
              AROMI is your AI coach: estimate food, log it, get workouts, or ask to adjust (e.g. &quot;no gym tomorrow&quot;).
            </p>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
              <div className="flex flex-wrap gap-3">
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as typeof mealType)}
                  className="px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim()) send("food_estimation");
                  }}
                  placeholder="e.g. 2 rotis with paneer butter masala"
                  className="flex-1 min-w-[160px] px-4 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  placeholder="g"
                  className="w-14 px-2 py-2.5 text-sm text-center text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
                  aria-label="Grams"
                />
                <button
                  onClick={() => input.trim() && send("food_estimation")}
                  disabled={loading || !input.trim()}
                  className="px-5 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim disabled:opacity-50"
                >
                  {loading ? "…" : "Estimate"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => input.trim() && send("food_estimation")}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 rounded-lg bg-surface3 border border-border text-sm text-gray-200 hover:border-accent/50 hover:text-accent disabled:opacity-50"
                >
                  Generate estimate
                </button>
                <button
                  onClick={() => input.trim() && send("general_chat")}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 rounded-lg bg-surface3 border border-border text-sm text-gray-200 hover:border-accent/50 hover:text-accent disabled:opacity-50"
                >
                  General chat
                </button>
              </div>
            </section>

            {lastResponse && (
              <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5 space-y-4">
                <p className="text-white">{lastResponse.message}</p>
                {(hasCalories || lastResponse?.data) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface3 rounded-lg p-3 text-center">
                      <span className="text-muted text-xs block">Calories</span>
                      <span className="text-accent font-semibold text-lg">
                        {displayCalories != null ? `~${displayCalories}` : "—"}
                      </span>
                      {d?.confidence_range != null ? (
                        <span className="text-muted text-xs ml-1">{String(d.confidence_range)}</span>
                      ) : null}
                    </div>
                    {d!.macros != null ? (
                      <>
                        <div className="bg-surface3 rounded-lg p-3 text-center">
                          <span className="text-muted text-xs block">Protein</span>
                          <span className="font-semibold">{formatMacroValue((d!.macros as Record<string, unknown>).protein_g)}</span>
                        </div>
                        <div className="bg-surface3 rounded-lg p-3 text-center">
                          <span className="text-muted text-xs block">Carbs</span>
                          <span className="font-semibold">{formatMacroValue((d!.macros as Record<string, unknown>).carbs_g)}</span>
                        </div>
                        <div className="bg-surface3 rounded-lg p-3 text-center">
                          <span className="text-muted text-xs block">Fat</span>
                          <span className="font-semibold">{formatMacroValue((d!.macros as Record<string, unknown>).fat_g)}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
                {showConfirm && (
                  <button
                    disabled={saving}
                    onClick={handleConfirmLog}
                    className="w-full py-2.5 rounded-lg bg-accent text-black font-semibold hover:bg-accentDim disabled:opacity-50"
                  >
                    {saving ? "Adding…" : "Add to log"}
                  </button>
                )}
                {showWorkout ? (
                  <p className="text-accent/90 text-sm pt-2">
                    Your plan is ready. Go to the <button type="button" onClick={() => setTab("workout")} className="underline font-medium">Workout</button> tab to see it.
                  </p>
                ) : null}
              </section>
            )}
          </div>
        )}

        {tab === "workout" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">Workout</h2>
            <p className="text-muted text-sm">
              Your plan uses the same profile as your <strong className="text-gray-300">calorie & protein targets</strong> (age, activity, goal, equipment). Set or edit your details on the <strong className="text-gray-300">Dashboard</strong> tab, then generate your plan here.
            </p>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Profile in use</h3>
              <p className="text-muted text-xs mb-3">Age {activeProfile.age} · {activeProfile.activity_level} · {activeProfile.goal.replace("_", " ")} · {activeProfile.equipment}</p>
              <p className="text-muted text-xs mb-3">Daily targets from this profile: {targets.kcal} kcal · {targets.protein_g}g protein</p>
              <button
                type="button"
                onClick={() => { setTab("dashboard"); setTimeout(() => document.getElementById("profile-for-calorie-estimate")?.scrollIntoView({ behavior: "smooth" }), 100); }}
                className="text-sm font-medium text-accent hover:underline"
              >
                Edit profile on Dashboard →
              </button>
            </section>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5 space-y-4">
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider">Generate or adjust</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={workoutAdjustInput}
                  onChange={(e) => setWorkoutAdjustInput(e.target.value)}
                  placeholder="e.g. I'm travelling tomorrow, no gym"
                  className="flex-1 px-4 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
                />
                <button
                  onClick={handleAdjustPlan}
                  disabled={loading || !workoutAdjustInput.trim()}
                  className="px-5 py-2.5 rounded-lg bg-surface3 border border-border text-gray-200 font-medium hover:border-accent/50 hover:text-accent disabled:opacity-50"
                >
                  Adjust
                </button>
              </div>
              <button
                onClick={handleGenerateWorkout}
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-accent text-black font-semibold hover:bg-accentDim disabled:opacity-50"
              >
                Generate workout plan
              </button>
            </section>

            {lastResponse?.ui_hint === "show_workout" && d?.days != null ? (
              <section className="space-y-4">
                <h3 className="text-sm font-medium text-muted uppercase tracking-wider">Your plan</h3>
                {(d.days as {
                  day: string;
                  focus?: string;
                  warmup?: string;
                  exercises?: Array<{ name: string; sets?: string; reps?: string }>;
                }[]).map((day, i) => (
                  <div key={i} className="bg-surface2 border border-border rounded-xl shadow-sm p-5 space-y-3">
                    <div>
                      <div className="font-semibold text-accent">{day.day}</div>
                      {day.focus != null && day.focus.trim() !== "" ? (
                        <div className="text-muted text-sm mt-0.5">{day.focus}</div>
                      ) : null}
                    </div>
                    {day.warmup != null && day.warmup.trim() !== "" ? (
                      <p className="text-muted text-sm">Warm-up: {day.warmup}</p>
                    ) : null}
                    <ul className="space-y-2">
                      {day.exercises?.map((ex, j) => {
                        const sets = ex.sets?.trim();
                        const reps = ex.reps?.trim();
                        const setsReps =
                          sets && reps ? `${sets} × ${reps}` : sets || reps || "";
                        return (
                          <li key={j} className="text-gray-200 text-sm flex items-baseline gap-2">
                            <span className="text-accent/80 shrink-0">·</span>
                            <span className="font-medium text-white">{ex.name}</span>
                            {setsReps ? <span className="text-muted">{setsReps}</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

