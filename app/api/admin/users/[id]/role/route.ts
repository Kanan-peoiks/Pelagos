import { NextResponse } from "next/server";
import { authHeaders, backendUrl } from "@/lib/server/backend";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.role) {
    return NextResponse.json({ error: "Missing role." }, { status: 400 });
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
    res = await fetch(`${backend}/admin/users/${encodeURIComponent(id)}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ role: body.role }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    return NextResponse.json({ error: detail?.detail || "Failed to update role." }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
