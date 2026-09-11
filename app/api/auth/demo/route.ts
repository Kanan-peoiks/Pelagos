import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { backendUrl } from "@/lib/server/backend";

export async function POST() {
  let backend: string;
  try {
    backend = backendUrl();
  } catch {
    return NextResponse.json({ error: "Backend not configured." }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(`${backend}/auth/demo`, { method: "POST", cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Could not start a demo session." }, { status: res.status });
  }

  const data = await res.json();

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(AUTH_COOKIE_NAME, data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // demo sessions are short-lived by design
  });
  return response;
}
