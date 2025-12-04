"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";

type MembershipRow = {
  hive_id: string;
  hives?: { name: string | null } | { name: string | null }[] | null;
};

export default function HivesClient() {
  const router = useRouter();
  const supabase = supabaseBrowserClient;
  const [loading, setLoading] = useState(!supabase);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase is not configured."
  );
  const [rows, setRows] = useState<{ hive_id: string; name: string | null }[]>(
    []
  );

  useEffect(() => {
    if (!supabase) return;

    const load = async () => {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (sessionErr || !sessionData.session?.user?.id) {
        setError(sessionErr?.message ?? "Please sign in");
        router.replace("/");
        return;
      }
      const userId = sessionData.session.user.id;
      const { data: memberships, error: mErr } = await supabase
        .from("hive_members")
        .select("hive_id,hives(name)")
        .eq("user_id", userId);
      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }
      const normalized =
        (memberships as MembershipRow[] | null | undefined)?.map((m) => {
          const hiveRel = Array.isArray(m.hives) ? m.hives[0] : m.hives;
          return { hive_id: String(m.hive_id), name: hiveRel?.name ?? null };
        }) ?? [];
      setRows(normalized);
      setLoading(false);
    };

    load();
  }, [router, supabase]);

  if (loading) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[480px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
      <h1 className="text-2xl font-semibold text-[#172847]">Your Hives</h1>
      <p className="text-sm text-[#566175] text-center">Select a hive to continue.</p>
      <div className="w-full flex flex-col gap-3">
        {rows.map((row) => (
          <a
            key={row.hive_id}
            href={`/hives/${row.hive_id}`}
            className="w-full border border-slate-200 rounded-lg px-4 py-6 hover:border-indigo-200 transition flex items-center gap-2"
          >
            <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-sm font-semibold">
              {(row.name ?? "Hive").slice(0, 2).toUpperCase()}
            </div>
            <div className="text-sm font-medium text-slate-800 truncate">
              {row.name ?? "Hive"}
            </div>
          </a>
        ))}
        {rows.length === 0 && (
          <div className="text-sm text-slate-500 text-center">
            You are not a member of any hives yet.
          </div>
        )}
        <a
          href="/hive-setup"
          className="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-4"
        >
          Create a new Hive
        </a>
      </div>
    </div>
  );
}
