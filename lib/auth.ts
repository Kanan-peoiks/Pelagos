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

export type UserRole = "viewer" | "operator" | "admin";

export type AuthUser = {
  name: string;
  email: string;
  role: UserRole;
  isDemo: boolean;
};

/** Anyone at "viewer" (including the demo account) can browse but not
 * create/decide incidents, generate reports, etc. */
export function canOperate(user: AuthUser | null): boolean {
  return user?.role === "operator" || user?.role === "admin";
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin";
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

/** Login can't just succeed/fail — admin accounts pause on a 2FA code step
 * first (see AuthForm.tsx), so this is its own result type rather than
 * AuthResult. */
export type LoginResult =
  | { status: "success"; user: AuthUser }
  | { status: "twoFactorRequired"; challengeId: string }
  | { status: "error"; error: string };

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
): Promise<LoginResult> {
  const emailError = validateEmail(email);
  if (emailError) return { status: "error", error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { status: "error", error: passwordError };

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, remember }),
    });

    if (!res.ok) {
      return { status: "error", error: await parseErrorMessage(res, "Invalid email or password.") };
    }

    const data = (await res.json()) as { requiresTwoFactor?: boolean; challengeId?: string; user?: AuthUser };
    if (data.requiresTwoFactor && data.challengeId) {
      return { status: "twoFactorRequired", challengeId: data.challengeId };
    }

    const user = data.user as AuthUser;
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return { status: "success", user };
  } catch {
    return { status: "error", error: "Could not reach the server. Please try again." };
  }
}

/** Completes an admin login after the 6-digit email code — see `login()`'s
 * "twoFactorRequired" result. `remember` must be passed again since this is
 * a separate request from the original password submission. */
export async function verifyTwoFactor(
  challengeId: string,
  code: string,
  remember = false
): Promise<AuthResult> {
  try {
    const res = await fetch("/api/auth/verify-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, code: code.trim(), remember }),
    });

    if (!res.ok) {
      return { ok: false, error: await parseErrorMessage(res, "Invalid or expired code.") };
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
): Promise<LoginResult> {
  if (!fullName.trim()) {
    return { status: "error", error: "Full name is required." };
  }

  const emailError = validateEmail(email);
  if (emailError) return { status: "error", error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { status: "error", error: passwordError };

  if (password !== confirmPassword) {
    return { status: "error", error: "Passwords do not match." };
  }

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName.trim(), email: email.trim(), password }),
    });

    if (!res.ok) {
      return { status: "error", error: await parseErrorMessage(res, "Could not create account.") };
    }

    // Rare: only if this email is in the backend's ADMIN_EMAILS list.
    const data = (await res.json()) as { requiresTwoFactor?: boolean; challengeId?: string; user?: AuthUser };
    if (data.requiresTwoFactor && data.challengeId) {
      return { status: "twoFactorRequired", challengeId: data.challengeId };
    }

    const user = data.user as AuthUser;
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return { status: "success", user };
  } catch {
    return { status: "error", error: "Could not reach the server. Please try again." };
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

/** Re-fetches the current user from the backend (the real source of truth
 * for role) and overwrites the localStorage cache. Called on every
 * AppShell mount so a stale cached role (e.g. left over from testing a
 * different account in the same browser) can never linger — the backend
 * enforces permissions regardless, but the UI should never show one thing
 * while the backend does another. Returns null (and clears the session) if
 * the cookie is missing/invalid. */
export async function refreshCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      logout();
      return null;
    }
    const { user } = (await res.json()) as { user: AuthUser };
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return user;
  } catch {
    // Network hiccup — keep whatever was cached rather than logging out.
    return readStoredUser();
  }
}

export function logout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}
