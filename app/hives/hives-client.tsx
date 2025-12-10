"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/utils/storage";
import Button from "@/components/button";

type MembershipRow = {
  hive_id: string;
  hives?:
    | { name: string | null; slug?: string | null; logo_url?: string | null }
    | { name: string | null; slug?: string | null; logo_url?: string | null }[]
    | null;
};

export default function HivesClient() {
  const router = useRouter();
  const supabase = supabaseBrowserClient;
  const [loading, setLoading] = useState(!supabase);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Supabase is not configured."
  );
  const [rows, setRows] = useState<
    {
      hive_id: string;
      hive_slug: string | null;
      name: string | null;
      logo: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (!supabase) return;

    const load = async () => {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (sessionErr || !sessionData.session?.user?.id) {
        console.error("[hives-client] session missing", {
          sessionErr,
          sessionData,
        });
        setError(sessionErr?.message ?? "No session in hives-client");
        setLoading(false);
        return;
      }
      const userId = sessionData.session.user.id;
      console.log("[hives-client] session user", userId);
      const { data: memberships, error: mErr } = await supabase
        .from("hive_members")
        .select("hive_id,hives(name,slug,logo_url)")
        .eq("user_id", userId);
      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        console.error("[hives-client] hive_members query error", mErr);
        return;
      }
      const normalized: {
        hive_id: string;
        hive_slug: string | null;
        name: string | null;
        logo_path: string | null;
      }[] =
        (memberships as MembershipRow[] | null | undefined)?.map((m) => {
          const hiveRel = Array.isArray(m.hives) ? m.hives[0] : m.hives;
          return {
            hive_id: String(m.hive_id),
            hive_slug: hiveRel?.slug ?? null,
            name: hiveRel?.name ?? null,
            logo_path: hiveRel?.logo_url ?? null,
          };
        }) ?? [];
      const resolved = await Promise.all(
        normalized.map(async (row) => {
          const logo = await getSignedUrl(
            supabase,
            "logos",
            row.logo_path,
            300
          );
          return {
            hive_id: row.hive_id,
            hive_slug: row.hive_slug,
            name: row.name,
            logo,
          };
        })
      );
      console.log("[hives-client] memberships", normalized);
      setRows(resolved);
      setLoading(false);
    };

    load().catch((err) => {
      console.error("[hives-client] unexpected load error", err);
      setError(err instanceof Error ? err.message : "Failed to load hives");
      setLoading(false);
    });
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
          <button
            key={row.hive_id}
            type="button"
            onClick={async () => {
              console.log("[hives-client] click hive", row);
              try {
                localStorage.setItem("last_hive_id", row.hive_id);
                await fetch("/api/last-hive", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ hiveId: row.hive_id }),
                });
              } catch (err) {
                console.error("[hives-client] failed to set last_hive_id", err);
              }
              router.push(`/hives/${row.hive_slug ?? row.hive_id}`);
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-6 hover:border-indigo-200 transition flex items-center gap-2 text-left"
          >
            {row.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.logo}
                alt={row.name ?? "Hive logo"}
                className="h-12 w-12 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-sm font-semibold">
                {(row.name ?? "Hive").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-sm font-medium text-slate-800 truncate">
              {row.name ?? "Hive"}
            </div>
          </button>
        ))}
        {rows.length === 0 && (
          <div className="text-sm text-slate-500 text-center">
            You are not a member of any hives yet.
          </div>
        )}
        <Button className="w-full py-4" onClick={() => router.push("/hive-setup")}>
          Create a new Hive
        </Button>
      </div>
    </div>
  );
}
