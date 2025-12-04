"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { MagnifyingGlass } from "@phosphor-icons/react";

type HiveRow = { id: string; name: string };

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<HiveRow[]>([]);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/");
      }
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    const trimmed = term.trim();
    if (!trimmed) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      const pattern = `%${trimmed}%`;
      const { data, error } = await supabase
        .from("hives")
        .select("id,name")
        .ilike("name", pattern)
        .limit(5);
      if (error) {
        setError(error.message);
        return;
      }
      setError(null);
      setMatches(data ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [term]);

  const showNoResult = useMemo(
    () => term.trim().length > 0 && matches.length === 0,
    [term, matches]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F0F5] flex items-center justify-center text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F5] flex items-center justify-center px-4">
      <div className="w-[473px] max-w-full bg-white border border-[#E2E8F0] rounded-2xl shadow-sm flex flex-col items-center gap-4 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-[#172847]">
            Welcome to HiveMind!
          </h1>
          <p className="text-sm text-[#566175] leading-relaxed">
            To get started, you need to create or join a Hive. Hives are an
            organisation’s homepage where all their sessions and members are
            hosted.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 w-full text-center">
            {error}
          </div>
        )}

        <button
          className="w-full h-10 bg-[#3A1DC8] hover:bg-[#2f18a6] text-white text-sm font-medium rounded-lg flex items-center justify-center"
          onClick={() => router.push("/hive-setup")}
        >
          Create a new Hive
        </button>

        <div className="text-sm text-[#9EA3B8]">or</div>

        <div className="w-full relative">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by organisation name"
            className="w-full h-10 border border-[#E2E8F0] rounded-md px-3 pr-10 text-sm text-slate-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
          <div className="absolute inset-y-0 right-3 flex items-center text-[#172847]">
            <MagnifyingGlass size={16} />
          </div>
        </div>

        {matches.length > 0 && (
          <div className="w-full border border-slate-200 rounded-lg divide-y divide-slate-200">
            {matches.map((m) => (
              <button
                key={m.id}
                className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  if (!supabaseBrowserClient) return;
                  supabaseBrowserClient.auth.getSession().then(async ({ data }) => {
                    const userId = data.session?.user?.id;
                    if (userId) {
                      await supabaseBrowserClient
                        .from("hive_members")
                        .upsert({ hive_id: m.id, user_id: userId, role: "member" });
                    }
                    router.push(`/hives/${m.id}`);
                  });
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {showNoResult && (
          <div className="text-center text-sm text-[#566175] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full">
            We could not find an organisation by that name. Ask for an invite or
            start a new Hive!
          </div>
        )}
      </div>
    </div>
  );
}
