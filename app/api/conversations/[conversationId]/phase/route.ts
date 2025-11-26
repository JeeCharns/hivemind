import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "Create phase transition (stub)" });
}

export async function PATCH() {
  return NextResponse.json({ message: "Update phase (stub)" });
}
