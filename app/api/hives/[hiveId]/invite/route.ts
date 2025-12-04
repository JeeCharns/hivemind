"use server";

import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hiveId: string }> }
) {
  const { hiveId } = await params;
  const body = await req.json().catch(() => null);
  const emails: string[] = body?.emails ?? [];
  if (!hiveId) {
    return NextResponse.json({ error: "Missing hive id" }, { status: 400 });
  }
  // Stub: in a real implementation, send emails with invite links
  return NextResponse.json({ message: "Invites queued", count: emails.length });
}
