"use server";

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { getCurrentUserProfile } from "@/lib/utils/user";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  const { responseId } = await params;
  const id = Number(responseId);
  if (!responseId) {
    return NextResponse.json({ error: "Invalid response id" }, { status: 400 });
  }

  const supabase = supabaseServerClient();
  const currentUser = await getCurrentUserProfile(supabase);
  const userId = currentUser?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabase.from("response_likes").upsert(
    {
      response_id: responseId,
      user_id: userId,
    },
    { onConflict: "response_id,user_id" }
  );

  if (error) {
    return NextResponse.json({ error: "Failed to like" }, { status: 500 });
  }

  const { count } = await supabase
    .from("response_likes")
    .select("*", { count: "exact", head: true })
    .eq("response_id", id);

  return NextResponse.json({ liked: true, like_count: count ?? 0 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  const { responseId } = await params;
  const id = Number(responseId);
  if (!responseId) {
    return NextResponse.json({ error: "Invalid response id" }, { status: 400 });
  }

  const supabase = supabaseServerClient();
  const currentUser = await getCurrentUserProfile(supabase);
  const userId = currentUser?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabase
    .from("response_likes")
    .delete()
    .eq("response_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to unlike" }, { status: 500 });
  }

  const { count } = await supabase
    .from("response_likes")
    .select("*", { count: "exact", head: true })
    .eq("response_id", responseId);

  return NextResponse.json({ liked: false, like_count: count ?? 0 });
}
