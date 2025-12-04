"use server";

import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_USER_ID } from "@/lib/config";
import { NextRequest, NextResponse } from "next/server";

const TAGS = ["data", "problem", "need", "want", "risk", "proposal"];
const MAX_LEN = 200;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  const { data: responses, error } = await supabase
    .from("conversation_responses")
    .select("id,response_text,tag,created_at,user_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch responses" },
      { status: 500 }
    );
  }

  const ids = (responses ?? []).map((r) => r.id);
  const userIds = Array.from(new Set((responses ?? []).map((r) => r.user_id)));

  let likes: { response_id: number; user_id: string }[] = [];
  if (ids.length > 0) {
    const { data: likesData } = await supabase
      .from("response_likes")
      .select("response_id,user_id")
      .in("response_id", ids);
    likes = likesData ?? [];
  }

  let profiles: { id: string; display_name: string | null }[] = [];
  if (userIds.length > 0) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", userIds);
    profiles = profileData ?? [];
  }

  const profileMap = profiles.reduce<Record<string, { name: string; avatar_url: string | null }>>(
    (acc, p) => {
      acc[p.id] = {
        name: p.display_name ?? "Anonymous",
        avatar_url: null,
      };
      return acc;
    },
    {}
  );

  const likeCountMap = likes.reduce<Record<number, number>>((acc, l) => {
    acc[l.response_id] = (acc[l.response_id] ?? 0) + 1;
    return acc;
  }, {});

  const likedByMe = likes.reduce<Record<number, boolean>>((acc, l) => {
    if (l.user_id === DEFAULT_USER_ID) acc[l.response_id] = true;
    return acc;
  }, {});

  const payload =
    responses?.map((r) => ({
      id: r.id,
      text: r.response_text,
      tag: r.tag,
      created_at: r.created_at,
      user: profileMap[r.user_id] ?? { name: "Anonymous", avatar_url: null },
      like_count: likeCountMap[r.id] ?? 0,
      liked_by_me: likedByMe[r.id] ?? false,
    })) ?? [];

  return NextResponse.json({ responses: payload });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();
  const body = await req.json().catch(() => null);
  const text = (body?.text ?? "").toString().trim();
  const tag = (body?.tag ?? "").toString().toLowerCase();
  const anonymous = Boolean(body?.anonymous);

  if (!text || text.length === 0) {
    return NextResponse.json({ error: "Response text is required" }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: "Response text exceeds limit" }, { status: 400 });
  }
  if (!TAGS.includes(tag)) {
    return NextResponse.json({ error: "Tag is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversation_responses")
    .insert({
      conversation_id: conversationId,
      response_text: text,
      tag,
      user_id: DEFAULT_USER_ID,
    })
    .select(
      `
        id,
        response_text,
        tag,
        created_at,
        user_id,
        profiles:profiles!conversation_responses_user_id_fkey ( display_name )
      `
    )
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save response" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    response: {
      id: data.id,
      text: data.response_text,
      tag: data.tag,
      created_at: data.created_at,
      user: {
        name: anonymous
          ? "Anonymous"
          : (data as { profiles?: { display_name?: string | null } })?.profiles
              ?.display_name ?? "Anonymous",
        avatar_url: null,
      },
      like_count: 0,
      liked_by_me: false,
    },
  });
}
