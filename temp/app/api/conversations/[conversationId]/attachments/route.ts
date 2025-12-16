import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Upload/list attachments (stub)" });
}

export async function GET() {
  return NextResponse.json({ message: "List attachments (stub)" });
}
