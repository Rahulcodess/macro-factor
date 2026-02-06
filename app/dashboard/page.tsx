"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AromiRequest, AromiResponse, UserContext, FoodLogEntry, Macros } from "@/lib/types";
import { loadLog, saveLog, last7DaysCalories, last7DaysMacros, dateKey } from "@/lib/storage";
import { getUser, logout as logoutLocal } from "@/lib/auth";

const DEFAULT_CONTEXT: UserContext = {
  age: 21,
  height_cm: 175,
  weight_kg: 72,
  activity_level: "moderate",
  goal: "fat_loss",
  diet: "vegetarian",
  health_conditions: [],
  injuries: [],
  equipment: "gym",
};

const TARGETS = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

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

  // Auth guard
  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login?next=/dashboard");
      return;
    }
    setUserEmail(u.email);
  }, [router]);

  const logLoadedRef = useRef(false);
  useEffect(() => {
    setLog(loadLog());
    logLoadedRef.current = true;
  }, []);
  useEffect(() => {
    if (logLoadedRef.current) saveLog(log);
  }, [log]);

  const addToLog = useCallback((entry: Omit<FoodLogEntry, "id" | "created_at">) => {
    setLog((prev) => [
      ...prev,
      {
        ...entry,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      },
    ]);
  }, []);

  const removeFromLog = useCallback((id: string) => {
    setLog((prev) => prev.filter((e) => e.id !== id));
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
        const cal = data.data?.estimated_calories;
        if (typeof cal === "number" && (intent === "food_estimation" || intent === "food_log")) {
          const gramsNum = grams.trim() ? parseInt(grams.trim(), 10) : undefined;
          setPendingLog({
            food_text: (intent === "food_estimation" || intent === "food_log" ? input : "") || "Logged food",
            meal_type: mealType,
            estimated_calories: cal,
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

  const handleConfirmLog = useCallback(() => {
    if (!pendingLog) return;
    addToLog({
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

  const handleGenerateWorkout = useCallback(() => {
    setInput("");
    send("workout_plan");
  }, [send]);

  const handleAdjustPlan = useCallback(() => {
    if (!input.trim()) return;
    send("adjust_plan");
  }, [input, send]);

  const d = lastResponse?.data;
  const hasCalories = d?.estimated_calories != null && typeof d.estimated_calories === "number";
  const showConfirm = hasCalories && pendingLog;
  const showWorkout = lastResponse?.ui_hint === "show_workout" && d?.days != null;

  const todayKey = dateKey(new Date());
  const todayEntries = log.filter((e) => e.created_at.startsWith(todayKey));
  const todayKcal = todayEntries.reduce((s, e) => s + e.estimated_calories, 0);
  const todayMacros = todayEntries.reduce(
    (acc, e) => ({
      protein_g: acc.protein_g + (e.macros?.protein_g ?? 0),
      carbs_g: acc.carbs_g + (e.macros?.carbs_g ?? 0),
      fat_g: acc.fat_g + (e.macros?.fat_g ?? 0),
    }),
    { protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
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
          <div className="flex gap-1 p-1 bg-surface3 rounded-xl">
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
        </div>
      </nav>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-10 flex flex-col gap-8">
        {tab === "dashboard" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">Overview</h2>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">Intake last 7 days</h3>
              <div className="h-32 w-full">
                {sevenDays.length > 0 && (() => {
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
                })()}
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
                        {Math.round(day.protein_g) || "—"} P
                      </div>
                      <div className="bg-amber-400/95 text-[10px] text-center text-gray-900 py-1">
                        {Math.round(day.fat_g) || "—"} F
                      </div>
                      <div className="bg-emerald-500/95 text-[10px] text-center text-white py-1">
                        {Math.round(day.carbs_g) || "—"} C
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
                <p className="text-3xl font-bold text-white tabular-nums">{todayKcal}</p>
                <p className="text-muted text-sm mt-0.5">of {TARGETS.kcal} kcal</p>
                <div className="mt-3 h-2 bg-surface3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.min(100, (todayKcal / TARGETS.kcal) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
                <p className="text-muted text-xs uppercase tracking-wider mb-2">Macros</p>
                <p className="text-lg font-semibold text-white tabular-nums">
                  {Math.round(todayMacros.protein_g)}
                  <span className="text-muted font-normal text-sm"> / {TARGETS.protein_g}</span> P
                </p>
                <p className="text-sm text-muted mt-1">
                  {Math.round(todayMacros.fat_g)}F · {Math.round(todayMacros.carbs_g)}C
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">Recent</h3>
              {todayEntries.length === 0 ? (
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
                    {todayKcal}
                    <span className="text-muted font-normal">/{TARGETS.kcal}</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Protein</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {Math.round(todayMacros.protein_g)}
                    <span className="text-muted font-normal">/{TARGETS.protein_g}g</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Fat</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {Math.round(todayMacros.fat_g)}
                    <span className="text-muted font-normal">/{TARGETS.fat_g}g</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider">Carbs</p>
                  <p className="text-lg font-semibold text-white tabular-nums">
                    {Math.round(todayMacros.carbs_g)}
                    <span className="text-muted font-normal">/{TARGETS.carbs_g}g</span>
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
                      onClick={() =>
                        addToLog({
                          food_text: entry.food_text,
                          meal_type: entry.meal_type,
                          estimated_calories: entry.estimated_calories,
                          grams: entry.grams,
                          confidence_range: entry.confidence_range,
                          macros: entry.macros,
                        })
                      }
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
                  <p className="text-accent font-semibold mt-2">~{Number(d!.estimated_calories)} kcal</p>
                  <button
                    onClick={() => {
                      const cal = Number(d!.estimated_calories);
                      const gramsNum = grams.trim() ? parseInt(grams.trim(), 10) : undefined;
                      const entry = pendingLog ?? {
                        food_text: input,
                        meal_type: mealType,
                        estimated_calories: cal,
                        grams: gramsNum != null && !Number.isNaN(gramsNum) ? gramsNum : undefined,
                        confidence_range: d!.confidence_range as string | undefined,
                        macros: d!.macros as Macros | undefined,
                      };
                      addToLog({
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
                    className="mt-3 w-full py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim"
                  >
                    Add to log
                  </button>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">Today&apos;s log</h3>
              {todayEntries.length === 0 ? (
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
                          onClick={() => removeFromLog(entry.id)}
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
              {todayEntries.length > 0 && <p className="text-muted text-sm mt-3">Total ~{todayKcal} kcal</p>}
            </section>
          </div>
        )}

        {tab === "chat" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">AROMI</h2>
            <p className="text-muted text-sm">
              Estimate food, log it, get workouts, or ask to adjust (e.g. &quot;no gym tomorrow&quot;).
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
                {hasCalories && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface3 rounded-lg p-3 text-center">
                      <span className="text-muted text-xs block">Calories</span>
                      <span className="text-accent font-semibold text-lg">{Number(d!.estimated_calories)}</span>
                      {d!.confidence_range != null ? (
                        <span className="text-muted text-xs ml-1">{String(d!.confidence_range)}</span>
                      ) : null}
                    </div>
                    {d!.macros != null ? (
                      <>
                        <div className="bg-surface3 rounded-lg p-3 text-center">
                          <span className="text-muted text-xs block">Protein</span>
                          <span className="font-semibold">{(d!.macros as Macros).protein_g}g</span>
                        </div>
                        <div className="bg-surface3 rounded-lg p-3 text-center">
                          <span className="text-muted text-xs block">Carbs</span>
                          <span className="font-semibold">{(d!.macros as Macros).carbs_g}g</span>
                        </div>
                        <div className="bg-surface3 rounded-lg p-3 text-center">
                          <span className="text-muted text-xs block">Fat</span>
                          <span className="font-semibold">{(d!.macros as Macros).fat_g}g</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
                {showConfirm && (
                  <button
                    onClick={handleConfirmLog}
                    className="w-full py-2.5 rounded-lg bg-accent text-black font-semibold hover:bg-accentDim"
                  >
                    Add to log
                  </button>
                )}
                {showWorkout ? (
                  <div className="space-y-4 pt-2">
                    {(d!.days as {
                      day: string;
                      warmup?: string;
                      exercises?: Array<{ name: string; sets?: string; reps?: string }>;
                    }[]).map((day, i) => (
                      <div key={i} className="bg-surface3 rounded-lg p-4 border border-border">
                        <div className="font-semibold text-accent mb-2">{day.day}</div>
                        {day.warmup != null ? <p className="text-muted text-sm mb-2">Warm-up: {day.warmup}</p> : null}
                        {day.exercises?.map((ex, j) => (
                          <div key={j} className="text-sm text-gray-200 py-0.5">
                            · {ex.name} {ex.sets != null ? `— ${ex.sets}` : ""} {ex.reps ?? ""}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            )}
          </div>
        )}

        {tab === "workout" && (
          <div className="space-y-8">
            <h2 className="text-base font-semibold text-white">Workout</h2>
            <p className="text-muted text-sm">
              Generate a plan or describe a change (e.g. &quot;no gym tomorrow&quot;) and click Adjust.
            </p>

            <section className="bg-surface2 border border-border rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. I'm travelling tomorrow, no gym"
                  className="flex-1 px-4 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
                />
                <button
                  onClick={handleAdjustPlan}
                  disabled={loading || !input.trim()}
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
                  warmup?: string;
                  exercises?: Array<{ name: string; sets?: string; reps?: string }>;
                }[]).map((day, i) => (
                  <div key={i} className="bg-surface2 border border-border rounded-xl shadow-sm p-5">
                    <div className="font-semibold text-accent mb-2">{day.day}</div>
                    {day.warmup != null ? <p className="text-muted text-sm mb-3">Warm-up: {day.warmup}</p> : null}
                    <ul className="space-y-1.5">
                      {day.exercises?.map((ex, j) => (
                        <li key={j} className="text-gray-200 text-sm">
                          · {ex.name} {ex.sets != null ? `— ${ex.sets}` : ""} {ex.reps ?? ""}
                        </li>
                      ))}
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

