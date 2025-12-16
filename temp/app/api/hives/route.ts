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

  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "hive";

  // Ensure slug uniqueness by suffixing a counter if needed
  let slug = slugBase;
  let counter = 1;
  while (true) {
    const { data: existing, error: slugErr } = await supabase
      .from("hives")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (slugErr) {
      return NextResponse.json(
        { error: slugErr.message ?? "Failed to check slug" },
        { status: 500 }
      );
    }
    if (!existing) break;
    counter += 1;
    slug = `${slugBase}-${counter}`;
  }

  const { data: hive, error: hiveError } = await supabase
    .from("hives")
    .insert({ name, logo_url, slug })
    .select("id,slug")
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

  return NextResponse.json({ id: hive.id, slug: hive.slug ?? null });
}
