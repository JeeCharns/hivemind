import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const slugify = (input: string) =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "slug";

async function upsertHive(name: string, slug: string) {
  const existing = await supabase
    .from("hives")
    .select("id,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existing.data) return existing.data;
  const { data, error } = await supabase
    .from("hives")
    .insert({ name, slug })
    .select("id,slug")
    .maybeSingle();
  if (error || !data) throw error || new Error("Failed to insert hive");
  return data;
}

async function upsertConversation(hiveId: string, title: string, slug: string) {
  const existing = await supabase
    .from("conversations")
    .select("id,slug,hive_id")
    .eq("hive_id", hiveId)
    .eq("slug", slug)
    .maybeSingle();
  if (existing.data) return existing.data;
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      hive_id: hiveId,
      title,
      slug,
      type: "understand",
      phase: "listen_open",
    })
    .select("id,slug,hive_id")
    .maybeSingle();
  if (error || !data) throw error || new Error("Failed to insert conversation");
  return data;
}

async function main() {
  const hiveName = process.env.SEED_HIVE_NAME || "Test Hive Slug";
  const conversationTitle =
    process.env.SEED_CONVERSATION_TITLE || "Test Conversation";
  const hiveSlug = slugify(hiveName);
  const convoSlug = slugify(conversationTitle);

  const hive = await upsertHive(hiveName, hiveSlug);
  const convo = await upsertConversation(hive.id, conversationTitle, convoSlug);

  console.log("Seed complete");
  console.log("Use these env vars for tests:");
  console.log(`TEST_HIVE_SLUG=${hive.slug}`);
  console.log(`TEST_CONVERSATION_SLUG=${convo.slug}`);
  console.log(`TEST_HIVE_ID=${hive.id}`);
  console.log(`TEST_CONVERSATION_ID=${convo.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
