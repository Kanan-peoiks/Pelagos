import { NextResponse } from "next/server";
import { authHeaders, backendUrl } from "@/lib/server/backend";

export async function GET() {
  let backend: string;
  try {
    backend = backendUrl();
  } catch {
    return NextResponse.json({ error: "Backend not configured." }, { status: 500 });
  }

  const headers = await authHeaders();
  if (!headers.Authorization) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(`${backend}/feedback`, { headers, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to load feedback." }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.kind || !body?.message) {
    return NextResponse.json({ error: "Missing kind or message." }, { status: 400 });
  }

  let backend: string;
  try {
    backend = backendUrl();
  } catch {
    return NextResponse.json({ error: "Backend not configured." }, { status: 500 });
  }

  const headers = await authHeaders();
  if (!headers.Authorization) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(`${backend}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ kind: body.kind, message: body.message }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    return NextResponse.json({ error: detail?.detail || "Failed to submit feedback." }, { status: res.status });
  }
  return NextResponse.json(await res.json(), { status: 201 });
}
