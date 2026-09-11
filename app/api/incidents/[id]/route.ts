import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/server/backend";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let backend: string;
  try {
    backend = backendUrl();
  } catch {
    return NextResponse.json({ error: "Backend not configured." }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(`${backend}/incidents/${encodeURIComponent(id)}`, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Incident not found." }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
