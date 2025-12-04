import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const hiveId = body?.hiveId;
  if (!hiveId) {
    return NextResponse.json({ error: "hiveId required" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("last_hive_id", hiveId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
