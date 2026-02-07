"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-white flex flex-col font-sans">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center text-black font-bold text-sm">
              MF
            </div>
            <span className="text-lg font-semibold tracking-tight">Macrofactor</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login?next=/dashboard"
              className="px-3 py-2 rounded-lg bg-surface3 border border-border text-sm text-gray-200 hover:border-accent/60 hover:text-accent"
            >
              Login
            </Link>
            <Link
              href="/login?next=/dashboard"
              className="hidden sm:inline px-3 py-2 rounded-lg bg-accent text-black text-sm font-semibold hover:bg-accentDim"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-5xl w-full grid gap-10 md:grid-cols-2 items-center">
          <section className="space-y-5">
            <p className="text-xs font-medium text-muted uppercase tracking-[0.25em]">
              AROMI · AI WELLNESS COACH
            </p>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight">
              One AI brain for{" "}
              <span className="text-accent">food logging</span>,{" "}
              <span className="text-accent">workouts</span>, and{" "}
              <span className="text-accent">real macros</span>.
            </h1>
            <p className="text-sm md:text-base text-muted max-w-md">
              Type what you actually eat, get approximate calories with uncertainty,
              confirm logs, and generate safe routines — all inside a single app wired to
              Groq (Llama&nbsp;3.3&nbsp;70B) and free nutrition data.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login?next=/dashboard"
                className="px-5 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accentDim"
              >
                Login
              </Link>
              <Link
                href="/login?next=/dashboard"
                className="px-5 py-2.5 rounded-lg bg-surface3 border border-border text-gray-200 text-sm font-medium hover:border-accent/60 hover:text-accent"
              >
                Get started
              </Link>
            </div>
            <ul className="mt-4 space-y-1 text-xs text-muted">
              <li>• Free-text Indian food logging</li>
              <li>• Calorie + macro estimates with confidence ranges</li>
              <li>• 3–5 day workouts that respect injuries + equipment</li>
            </ul>
          </section>

          <section className="hidden md:block">
            <div className="bg-surface2 border border-border rounded-3xl p-5 shadow-sm">
              <p className="text-xs text-muted mb-2">Today&apos;s intake</p>
              <p className="text-3xl font-bold">1,847</p>
              <p className="text-muted text-sm mb-3">/ 2,200 kcal</p>
              <div className="h-2 bg-surface3 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-accent" style={{ width: "84%" }} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div>
                  <p className="text-muted text-xs">Protein</p>
                  <p className="font-semibold">142g</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Carbs</p>
                  <p className="font-semibold">198g</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Fat</p>
                  <p className="font-semibold">65g</p>
                </div>
              </div>
              <p className="text-xs text-muted">
                Built on free nutrition APIs + Groq. No paid services, no fake precision — perfect
                for hackathons and real users.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

