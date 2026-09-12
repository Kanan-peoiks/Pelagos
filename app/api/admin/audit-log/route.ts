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
    res = await fetch(`${backend}/admin/audit-log`, { headers, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    return NextResponse.json({ error: detail?.detail || "Failed to load audit log." }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
