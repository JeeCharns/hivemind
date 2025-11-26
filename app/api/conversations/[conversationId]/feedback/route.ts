import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Feedback endpoint (stub)" });
}

export async function PATCH() {
  return NextResponse.json({ message: "Update feedback (stub)" });
}
