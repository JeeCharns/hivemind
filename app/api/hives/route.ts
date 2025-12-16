import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { createHiveSchema } from "@/lib/hives/data/hiveSchemas";

/**
 * GET /api/hives
 * List all hives where the user is a member
 */
export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await supabaseServerClient();

  // Get hives where user is a member
  const { data: memberships, error: memberError } = await supabase
    .from("hive_members")
    .select("hive_id")
    .eq("user_id", session.user.id);

  if (memberError) {
    return NextResponse.json(
      { error: memberError.message },
      { status: 500 }
    );
  }

  const hiveIds = memberships.map((m) => m.hive_id);

  if (hiveIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: hives, error: hiveError } = await supabase
    .from("hives")
    .select("*")
    .in("id", hiveIds)
    .order("created_at", { ascending: false });

  if (hiveError) {
    return NextResponse.json({ error: hiveError.message }, { status: 500 });
  }

  return NextResponse.json(hives);
}

/**
 * POST /api/hives
 * Create a new hive and add the user as admin
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Validate input
  const validation = createHiveSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { name, logo_url } = validation.data;
  const supabase = await supabaseServerClient();

  // Generate slug from name
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

  // Create hive
  const { data: hive, error: hiveError } = await supabase
    .from("hives")
    .insert({ name, logo_url, slug })
    .select()
    .single();

  if (hiveError || !hive) {
    return NextResponse.json(
      { error: hiveError?.message ?? "Failed to create hive" },
      { status: 500 }
    );
  }

  // Add user as admin
  const { error: memberError } = await supabase
    .from("hive_members")
    .insert({ hive_id: hive.id, user_id: session.user.id, role: "admin" });

  if (memberError) {
    return NextResponse.json(
      { error: "Hive created but failed to add member" },
      { status: 500 }
    );
  }

  return NextResponse.json(hive);
}
