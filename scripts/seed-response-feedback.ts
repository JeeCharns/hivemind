#!/usr/bin/env node
/**
 * Seed Response Feedback (agree/pass/disagree)
 *
 * Populates `response_feedback` for consolidated statement representative responses
 * (the first response in each cluster bucket) so the Understand UI has realistic
 * vote distributions on consolidated statements.
 *
 * Uses SUPABASE_SECRET_KEY (service role) so be careful which project you're targeting.
 */

import { createClient } from "@supabase/supabase-js";
import { ensureProfileExists } from "../lib/profiles/server/ensureProfileExists";

type Feedback = "agree" | "pass" | "disagree";

type Options = {
  conversationId: string;
  users: number;
  weights: { agree: number; pass: number; disagree: number };
  agreementHotspots: number;
  divisiveHotspots: number;
  createUsers: boolean;
  addCreatedUsersToHive: boolean;
  clearExisting: boolean;
  confirm: boolean;
  seedTag: string;
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWeights(weights: Options["weights"]): Options["weights"] {
  const total = weights.agree + weights.pass + weights.disagree;
  if (!Number.isFinite(total) || total <= 0)
    return { agree: 0.6, pass: 0.25, disagree: 0.15 };
  return {
    agree: weights.agree / total,
    pass: weights.pass / total,
    disagree: weights.disagree / total,
  };
}

function pickFeedback(weights: Options["weights"]): Feedback {
  const r = Math.random();
  if (r < weights.agree) return "agree";
  if (r < weights.agree + weights.pass) return "pass";
  return "disagree";
}

function sampleUnique<T>(items: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= items.length) return [...items];
  const chosen = new Set<number>();
  while (chosen.size < count) {
    chosen.add(Math.floor(Math.random() * items.length));
  }
  return Array.from(chosen).map((i) => items[i]);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function getArgValue(argv: string[], key: string): string | undefined {
  const idx = argv.indexOf(key);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function usage(): string {
  return [
    "",
    "Usage:",
    "  npx tsx scripts/seed-response-feedback.ts --conversationId <uuid> [options] --confirm",
    "",
    "Options:",
    "  --users <n>                 Target unique voters (default: 50)",
    "  --agree <n> --pass <n> --disagree <n>   Base vote weights (default: 0.6/0.25/0.15)",
    "  --agreementHotspots <n>     Responses with strong agreement (default: 5)",
    "  --divisiveHotspots <n>      Responses that split agree/disagree (default: 5)",
    "  --createUsers               Create extra auth users if hive has fewer members than --users",
    "  --addCreatedUsersToHive     Also insert created users into hive_members (default: true when --createUsers)",
    "  --clearExisting             Delete existing response_feedback for this conversation (requires --confirm)",
    "  --seedTag <tag>             Tag used in created user emails (default: seed-<timestamp>)",
    "  --confirm                   Actually write to the database (otherwise dry-run)",
    "",
    "Required env:",
    "  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SECRET_KEY",
    "",
  ].join("\n");
}

function parseOptions(argv: string[]): Options {
  const conversationId =
    getArgValue(argv, "--conversationId") || getArgValue(argv, "-c") || "";
  const users = parseNumber(getArgValue(argv, "--users"), 50);
  const agree = parseNumber(getArgValue(argv, "--agree"), 0.6);
  const pass = parseNumber(getArgValue(argv, "--pass"), 0.25);
  const disagree = parseNumber(getArgValue(argv, "--disagree"), 0.15);
  const agreementHotspots = parseNumber(
    getArgValue(argv, "--agreementHotspots"),
    5
  );
  const divisiveHotspots = parseNumber(
    getArgValue(argv, "--divisiveHotspots"),
    5
  );
  const createUsers = argv.includes("--createUsers");
  const addCreatedUsersToHive =
    argv.includes("--addCreatedUsersToHive") || createUsers;
  const clearExisting = argv.includes("--clearExisting");
  const confirm = argv.includes("--confirm");
  const seedTag = getArgValue(argv, "--seedTag") || `seed-${Date.now()}`;

  return {
    conversationId,
    users,
    weights: normalizeWeights({ agree, pass, disagree }),
    agreementHotspots,
    divisiveHotspots,
    createUsers,
    addCreatedUsersToHive,
    clearExisting,
    confirm,
    seedTag,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options.conversationId) {
    console.error("Missing --conversationId");
    console.error(usage());
    process.exit(1);
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error(
      "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function fetchConsolidatedStatementRepresentativeIds(
    conversationId: string
  ): Promise<string[]> {
    // Each cluster bucket's representative is its first member response (lowest response_id).
    // The UI votes on this representative when users agree/disagree with a consolidated statement.
    const { data: buckets, error: bucketsError } = await supabase
      .from("conversation_cluster_buckets")
      .select("id")
      .eq("conversation_id", conversationId);

    if (bucketsError)
      throw new Error(
        `Failed to fetch cluster buckets: ${bucketsError.message}`
      );
    if (!buckets || buckets.length === 0) {
      throw new Error(
        "Conversation has no consolidated statements (cluster buckets); nothing to seed"
      );
    }

    const bucketIds = buckets.map((b) => String((b as { id: unknown }).id));
    const representativeIds: string[] = [];

    // For each bucket, find the first (lowest) response_id — that's the representative
    for (const bucketId of bucketIds) {
      const { data: members, error: membersError } = await supabase
        .from("conversation_cluster_bucket_members")
        .select("response_id")
        .eq("bucket_id", bucketId)
        .order("response_id", { ascending: true })
        .limit(1);

      if (membersError)
        throw new Error(
          `Failed to fetch bucket members for ${bucketId}: ${membersError.message}`
        );
      if (members && members.length > 0) {
        representativeIds.push(
          String((members[0] as { response_id: unknown }).response_id)
        );
      }
    }

    return representativeIds;
  }

  async function fetchHiveMembers(hiveId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("hive_members")
      .select("user_id")
      .eq("hive_id", hiveId);

    if (error)
      throw new Error(`Failed to fetch hive members: ${error.message}`);
    return (data || []).map((r) => String((r as { user_id: unknown }).user_id));
  }

  async function createSeedUsers(
    count: number,
    seedTag: string
  ): Promise<string[]> {
    const ids: string[] = [];

    for (let i = 0; i < count; i++) {
      const email = `${seedTag}+${i}@example.com`;
      const password = `seed-${Math.random().toString(36).slice(2)}-${Date.now()}`;

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { seeded: true, seedTag },
      });

      if (error || !data.user) {
        throw new Error(
          `Failed to create seed user (${email}): ${error?.message || "unknown error"}`
        );
      }

      await ensureProfileExists(supabase, { id: data.user.id, email });
      ids.push(data.user.id);
    }

    return ids;
  }

  async function addUsersToHive(
    hiveId: string,
    userIds: string[]
  ): Promise<void> {
    if (userIds.length === 0) return;
    const rows = userIds.map((userId) => ({
      hive_id: hiveId,
      user_id: userId,
      role: "member",
    }));
    const { error } = await supabase.from("hive_members").upsert(rows, {
      onConflict: "hive_id,user_id",
      ignoreDuplicates: true,
    });
    if (error)
      throw new Error(`Failed to add users to hive_members: ${error.message}`);
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id")
    .eq("id", options.conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error(`Conversation not found: ${options.conversationId}`);
  }

  const responseIds = await fetchConsolidatedStatementRepresentativeIds(
    options.conversationId
  );
  if (responseIds.length === 0) {
    throw new Error(
      "Conversation has no consolidated statements; nothing to seed"
    );
  }

  // Prefer real hive members as voter identities (no auth pollution).
  const hiveId = String((conversation as { hive_id: unknown }).hive_id);
  const hiveMemberIds = await fetchHiveMembers(hiveId);
  const desiredUsers = Math.max(1, Math.floor(options.users));
  const baseUsers = hiveMemberIds.slice(0, desiredUsers);

  const missing = Math.max(0, desiredUsers - baseUsers.length);
  let createdUserIds: string[] = [];
  if (missing > 0 && options.createUsers) {
    createdUserIds = await createSeedUsers(missing, options.seedTag);
    if (options.addCreatedUsersToHive) {
      await addUsersToHive(hiveId, createdUserIds);
    }
  }

  const userIds = [...baseUsers, ...createdUserIds];

  const agreementIds = new Set(
    sampleUnique(
      responseIds,
      Math.min(options.agreementHotspots, responseIds.length)
    )
  );
  const remainingForDivisive = responseIds.filter(
    (id: string) => !agreementIds.has(id)
  );
  const divisiveIds = new Set(
    sampleUnique(
      remainingForDivisive,
      Math.min(options.divisiveHotspots, remainingForDivisive.length)
    )
  );

  const agreementWeights: Options["weights"] = normalizeWeights({
    agree: 0.8,
    pass: 0.15,
    disagree: 0.05,
  });
  const divisiveWeights: Options["weights"] = normalizeWeights({
    agree: 0.45,
    pass: 0.1,
    disagree: 0.45,
  });

  if (!options.confirm) {
    console.log("Dry-run (add --confirm to write):");
    console.log(`  conversationId: ${options.conversationId}`);
    console.log(`  consolidatedStatements: ${responseIds.length}`);
    console.log(`  hiveMembers: ${hiveMemberIds.length}`);
    console.log(
      `  voters: ${userIds.length}${missing > 0 && !options.createUsers ? " (set --createUsers to reach target)" : ""}`
    );
    console.log(`  each voter votes on all ${responseIds.length} statements`);
    console.log(
      `  agreementHotspots: ${agreementIds.size}, divisiveHotspots: ${divisiveIds.size}`
    );
    if (missing > 0 && options.createUsers) {
      console.log(
        `  createdUsers: ${createdUserIds.length} (seedTag: ${options.seedTag})`
      );
    }
    if (options.clearExisting) {
      console.log(
        "  clearExisting: true (will delete response_feedback rows for this conversation)"
      );
    }
    process.exit(0);
  }

  if (options.clearExisting) {
    const { error } = await supabase
      .from("response_feedback")
      .delete()
      .eq("conversation_id", options.conversationId);
    if (error)
      throw new Error(`Failed to clear existing feedback: ${error.message}`);
  }

  const rows: Array<{
    conversation_id: string;
    response_id: string;
    user_id: string;
    feedback: Feedback;
  }> = [];

  const totals = { agree: 0, pass: 0, disagree: 0 };

  for (const userId of userIds) {
    for (const responseId of responseIds) {
      const weights = agreementIds.has(responseId)
        ? agreementWeights
        : divisiveIds.has(responseId)
          ? divisiveWeights
          : options.weights;
      const feedback = pickFeedback(weights);
      totals[feedback]++;
      rows.push({
        conversation_id: options.conversationId,
        response_id: responseId,
        user_id: userId,
        feedback,
      });
    }
  }

  const batches = chunk(rows, 500);
  for (const batch of batches) {
    const { error } = await supabase.from("response_feedback").upsert(batch, {
      onConflict: "conversation_id,response_id,user_id",
    });
    if (error)
      throw new Error(`Failed to upsert response_feedback: ${error.message}`);
  }

  console.log("Seeded response_feedback:");
  console.log(`  conversationId: ${options.conversationId}`);
  console.log(
    `  voters: ${userIds.length} (existing: ${baseUsers.length}, created: ${createdUserIds.length})`
  );
  console.log(`  rows: ${rows.length}`);
  console.log(
    `  totals: agree=${totals.agree}, pass=${totals.pass}, disagree=${totals.disagree}`
  );
  if (createdUserIds.length > 0) {
    console.log(
      `  created user email prefix: ${options.seedTag}+<n>@example.com`
    );
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
