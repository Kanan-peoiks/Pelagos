import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { backendUrl } from "@/lib/server/backend";
import { verifyTurnstileToken } from "@/lib/server/turnstile";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.email || !body?.password) {
    return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
  }

  const captchaOk = await verifyTurnstileToken(body.turnstileToken, "register");
  if (!captchaOk) {
    return NextResponse.json({ error: "Verification challenge failed — please try again." }, { status: 403 });
  }

  let backend: string;
  try {
    backend = backendUrl();
  } catch {
    return NextResponse.json({ error: "Backend not configured." }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(`${backend}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: body.name, email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    return NextResponse.json(
      { error: detail?.detail || "Could not create account." },
      { status: res.status }
    );
  }

  const data = await res.json();

  // Rare: only triggers if this email is in the backend's ADMIN_EMAILS list,
  // so a fresh admin account still has to prove it owns the inbox before
  // getting a session, same as a normal admin login.
  if (data.requiresTwoFactor) {
    return NextResponse.json({ requiresTwoFactor: true, challengeId: data.challengeId });
  }

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(AUTH_COOKIE_NAME, data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
