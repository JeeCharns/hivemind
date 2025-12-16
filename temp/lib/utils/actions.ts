"use server";

import { supabaseServerClient } from "@/lib/supabase/serverClient";

type Conversation = {
  id: string;
  title: string;
  phase: string;
  type: "understand" | "decide";
  created_at: string;
};

export async function getHiveDashboardData(hiveId: string): Promise<{
  hiveName: string;
  conversations: Conversation[];
}> {
  const supabase = supabaseServerClient();

  const [{ data: hive }, { data: conversations }] = await Promise.all([
    supabase
      .from("hives")
      .select("name")
      .eq("id", hiveId)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id,title,phase,type,created_at")
      .eq("hive_id", hiveId),
  ]);

  return {
    hiveName: hive?.name ?? "Hive",
    conversations: (conversations ?? []) as Conversation[],
  };
}
