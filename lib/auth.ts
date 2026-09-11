// ============================================================
// SeaSentry Authentication
// ============================================================
// Client-side helpers for the real backend-backed auth flow.
// The actual JWT lives in an httpOnly cookie set by the
// /api/auth/* route handlers — it is never touched by this file
// or exposed to client JS. localStorage here only caches the
// user's display info (name/email) and a UX hint so pages can
// avoid a login-form flash; middleware.ts is the real gate.
// ============================================================

export const AUTH_STORAGE_KEY = "seasentry-auth";
export const USER_STORAGE_KEY = "seasentry-user";
export const AUTH_COOKIE_NAME = "seasentry_token";

export type AuthUser = {
  name: string;
  email: string;
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

export function getCurrentUser(): AuthUser | null {
  if (!isAuthenticated()) return null;
  return readStoredUser();
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "Email is required.";
  // Practical client-side check — not a security boundary.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

export async function login(
  email: string,
  password: string,
  remember = false
): Promise<AuthResult> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, remember }),
    });

    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res, "Invalid email or password.") };
    }

    const { user } = (await res.json()) as { user: AuthUser };
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return { ok: true, user };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

export async function register(
  fullName: string,
  email: string,
  password: string,
  confirmPassword: string
): Promise<AuthResult> {
  if (!fullName.trim()) {
    return { ok: false, error: "Full name is required." };
  }

  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName.trim(), email: email.trim(), password }),
    });

    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res, "Could not create account.") };
    }

    const { user } = (await res.json()) as { user: AuthUser };
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return { ok: true, user };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

/** Signs in as a fixed public demo account — no credentials needed. Used by
 * the "Continue as guest" button so a pitch audience can reach the
 * dashboard in one click. */
export async function loginAsDemo(): Promise<AuthResult> {
  try {
    const res = await fetch("/api/auth/demo", { method: "POST" });
    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res, "Could not start a demo session.") };
    }
    const { user } = (await res.json()) as { user: AuthUser };
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return { ok: true, user };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

export function logout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}
