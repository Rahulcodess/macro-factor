export type AuthUser = {
  email: string;
  name: string;
  createdAt: string;
};

const USER_KEY = "macrofactor_auth_user";

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function login(email: string, password: string): { ok: true; user: AuthUser } | { ok: false; error: string } {
  // Hackathon-safe demo auth:
  // - No server, no DB, no paid service.
  // - Accept any non-empty email + password (min length).
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (!password || password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };

  const user: AuthUser = {
    email: e,
    name: e.split("@")[0] || "User",
    createdAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    return { ok: false, error: "Could not save session. Try again." };
  }

  return { ok: true, user };
}

export function logout(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

