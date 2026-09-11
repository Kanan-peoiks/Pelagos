import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

/** Base URL of the FastAPI backend (Render in prod, local uvicorn in dev). */
export function backendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (!url) {
    throw new Error("BACKEND_URL is not configured.");
  }
  return url.replace(/\/+$/, "");
}

/** Authorization header built from the httpOnly session cookie, if present. */
export async function authHeaders(): Promise<Record<string, string>> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE_NAME)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
