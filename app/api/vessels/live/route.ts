import { NextRequest, NextResponse } from "next/server";
import { authHeaders, backendUrl } from "@/lib/server/backend";

export async function GET(request: NextRequest) {
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

  const region = request.nextUrl.searchParams.get("region") || "caspian";

  let res: Response;
  try {
    // The backend holds a ~20s live AIS subscription open before replying —
    // give this proxy plenty of headroom.
    res = await fetch(`${backend}/vessels/live?region=${encodeURIComponent(region)}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    return NextResponse.json({ error: detail?.detail || "Live AIS fetch failed." }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
