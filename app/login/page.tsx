"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUser, login } from "@/lib/auth";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  const existing = useMemo(() => getUser(), []);
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (existing) {
    return (
      <div className="min-h-screen bg-surface text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface2 border border-border rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-semibold">You’re already logged in</h1>
          <p className="text-muted text-sm mt-2">Continue to the app.</p>
          <button
            onClick={() => router.push(next)}
            className="mt-5 w-full py-2.5 rounded-lg bg-accent text-black font-semibold hover:bg-accentDim"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface2 border border-border rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        </div>

        <p className="text-muted text-sm mt-2">
          Sign in to continue to your dashboard.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            try {
              const res = await login(email, password);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push(next);
            } catch (err) {
              setError("Something went wrong. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              className="w-full px-3 py-2.5 text-sm text-white bg-surface3 border border-border rounded-lg placeholder:text-gray-400"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-accent text-black font-semibold hover:bg-accentDim disabled:opacity-50"
          >
            {loading ? "Logging in…" : "Login"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full py-2.5 rounded-lg bg-surface3 border border-border text-gray-200 font-medium hover:border-accent/50 hover:text-accent"
          >
            Back
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface text-white flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-surface2 border border-border rounded-xl shadow-sm p-6">
            <p className="text-muted text-sm">Loading…</p>
          </div>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

