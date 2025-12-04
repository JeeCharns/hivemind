"use server";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

export async function POST(req: NextRequest) {
  const supabase = supabaseServerClient();
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim?.() ?? "";
  const logo_url = body?.logo_url ?? null;
  const user_id = body?.user_id ?? null;

  if (!user_id) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: hive, error: hiveError } = await supabase
    .from("hives")
    .insert({ name, logo_url })
    .select("id")
    .maybeSingle();

  if (hiveError || !hive?.id) {
    return NextResponse.json(
      { error: hiveError?.message ?? "Failed to create hive" },
      { status: 500 }
    );
  }

  const { error: memberError } = await supabase
    .from("hive_members")
    .upsert({ hive_id: hive.id, user_id, role: "admin" });

  if (memberError) {
    return NextResponse.json(
      { error: "Hive created but failed to add member" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: hive.id });
}
