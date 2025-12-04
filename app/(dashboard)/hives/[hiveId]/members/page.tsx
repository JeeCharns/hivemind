import HiveMembersClient from "@/app/(dashboard)/hives/[hiveId]/members/members-client";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function HiveMembersPage({
  params,
}: {
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  const supabase = supabaseServerClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("hive_members")
    .select("user_id,role")
    .eq("hive_id", hiveId);

  const memberRows =
    (memberships ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role ?? "member",
    })) ?? [];

  const userIds = memberRows.map((m) => m.user_id);
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name,avatar_path")
        .in("id", userIds)
    : { data: [], error: null };

  const profileMap =
    profiles?.reduce<
      Record<
        string,
        { display_name: string | null; avatar_path: string | null }
      >
    >(
      (
        acc,
        p: {
          id: string;
          display_name: string | null;
          avatar_path: string | null;
        }
      ) => {
        acc[p.id] = {
          display_name: p.display_name,
          avatar_path: p.avatar_path ?? null,
        };
        return acc;
      },
      {}
    ) ?? {};

  const rows =
    memberRows
      .map((m) => ({
        ...m,
        name: profileMap[m.user_id]?.display_name ?? "Unknown",
        avatar_url: profileMap[m.user_id]?.avatar_path ?? null,
      }))
      .sort((a, b) => (a.role === "admin" && b.role !== "admin" ? -1 : 0)) ??
    [];

  console.log(
    "[members/page] memberships",
    memberships,
    "profiles",
    profiles,
    "errors",
    {
      membershipError,
      profileError,
    }
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Members</h1>
      <HiveMembersClient hiveId={hiveId} initialMembers={rows} />
    </div>
  );
}
