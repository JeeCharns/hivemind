import { SupabaseClient } from "@supabase/supabase-js";

type HiveRow = { id: string; slug: string | null; name?: string | null; logo_url?: string | null };
type ConversationRow = {
  id: string;
  slug: string | null;
  hive_id: string;
  title?: string | null;
  type?: string | null;
  phase?: string | null;
  analysis_status?: string | null;
  report_json?: unknown;
  created_at?: string | null;
  description?: string | null;
};

export async function fetchHiveByKey(
  supabase: SupabaseClient,
  key: string
): Promise<HiveRow> {
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(key);
  const query = supabase.from("hives").select("id,slug,name,logo_url");
  const { data, error } = isUuid
    ? await query.or(`id.eq.${key},slug.eq.${key}`).maybeSingle()
    : await query.eq("slug", key).maybeSingle();
  if (error || !data) {
    throw error || new Error("Hive not found");
  }
  return data as HiveRow;
}

export async function fetchConversationByKey(
  supabase: SupabaseClient,
  hiveId: string,
  key: string
): Promise<ConversationRow> {
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(key);
  const base = supabase
    .from("conversations")
    .select(
      "id,slug,hive_id,title,type,phase,analysis_status,report_json,created_at,description"
    )
    .eq("hive_id", hiveId);
  const { data, error } = isUuid
    ? await base.or(`id.eq.${key},slug.eq.${key}`).maybeSingle()
    : await base.eq("slug", key).maybeSingle();
  if (error || !data) {
    throw error || new Error("Conversation not found");
  }
  return data as ConversationRow;
}
