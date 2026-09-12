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
    res = await fetch(`${backend}/auth/me`, { headers, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Session invalid." }, { status: res.status });
  }
  return NextResponse.json({ user: await res.json() });
}
