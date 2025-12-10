"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserProfile } from "@/lib/utils/user";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function clientForToken(token?: string | null) {
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured");
  }
  return createClient(url, anonKey, {
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();

  const { data: responses, error } = await supabase
    .from("conversation_responses")
    .select(
      "id,response_text,tag,created_at,user_id,profiles(display_name,avatar_path)"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = responses?.map((r) => r.id) ?? [];
  const { data: likes } = ids.length
    ? await supabase
        .from("response_likes")
        .select("response_id,user_id")
        .in("response_id", ids)
    : { data: [] as { response_id: number; user_id: string }[] };

  const likeCounts = new Map<number, number>();
  likes?.forEach((l) => {
    likeCounts.set(l.response_id, (likeCounts.get(l.response_id) ?? 0) + 1);
  });

  const normalized =
    responses?.map((r) => ({
      id: r.id,
      text: (r as any).response_text,
      tag: r.tag,
      created_at: r.created_at,
      user: {
        name: r.profiles?.display_name || "Member",
        avatar_url: r.profiles?.avatar_path ?? null,
      },
      like_count: likeCounts.get(r.id) ?? 0,
      liked_by_me: false,
    })) ?? [];

  return NextResponse.json({ responses: normalized });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const token =
    req.headers.get("authorization")?.replace("Bearer ", "") ?? undefined;
  const authClient = clientForToken(token);

  const { data: authUser, error: userErr } = await authClient.auth.getUser();
  if (userErr || !authUser.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authUser.user.id;

  const { text, tag } = await req.json();
  if (!text || !tag) {
    return NextResponse.json(
      { error: "Text and tag are required" },
      { status: 400 }
    );
  }

  const supabase = supabaseServerClient();
  const { data, error } = await supabase
    .from("conversation_responses")
    .insert({
      conversation_id: conversationId,
      response_text: text,
      tag,
      user_id: userId,
    })
    .select(
      "id,response_text,tag,created_at,user_id,profiles(display_name,avatar_path)"
    )
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to submit response" },
      { status: 500 }
    );
  }

  const response = {
    id: data.id,
    text: (data as any).response_text,
    tag: data.tag,
    created_at: data.created_at,
    user: {
      name: data.profiles?.display_name || "Member",
      avatar_url: data.profiles?.avatar_path ?? null,
    },
    like_count: 0,
    liked_by_me: false,
  };

  return NextResponse.json({ response });
}
