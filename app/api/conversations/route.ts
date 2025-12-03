"use server";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_HIVE_ID } from "@/lib/config";

export async function POST(req: NextRequest) {
  const supabase = supabaseServerClient();
  const body = await req.json().catch(() => null);

  const title = body?.title?.trim?.() ?? "";
  const description = body?.description?.trim?.() ?? "";
  const type = body?.type === "decide" ? "decide" : "understand";

  if (!title) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      hive_id: DEFAULT_HIVE_ID,
      title,
      description,
      type,
      phase: "listen_open",
      analysis_status: "not_started",
      analysis_error: null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create conversation" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}
