export type AuthUser = {
  id: string;
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
    if (!parsed?.email || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!data.ok || !data.user) {
      return { ok: false, error: data.error || "Login failed" };
    }

    // Store user in localStorage for client-side access
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {
      // ignore localStorage errors
    }

    return { ok: true, user: data.user };
  } catch (error) {
    return { ok: false, error: "Network error. Please try again." };
  }
}

export function logout(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

