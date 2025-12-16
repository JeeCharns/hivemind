"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Alert from "@/components/alert";
import Button from "@/components/button";
import type { Session } from "@supabase/supabase-js";

type HiveRow = { id: string; name: string; slug: string | null };

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<HiveRow[]>([]);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setTimeout(() => {
        setError((prev) => prev ?? "Supabase is not configured.");
        setLoading(false);
      }, 0);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
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
      setTimeout(() => {
        setMatches((prev) => (prev.length ? [] : prev));
      }, 0);
      return;
    }
    const timer = setTimeout(async () => {
      const pattern = `%${trimmed}%`;
      const { data, error } = await supabase
        .from("hives")
        .select("id,name,slug")
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

        {error && <Alert variant="error">{error}</Alert>}

        <Button className="w-full" onClick={() => router.push("/hive-setup")}>
          Create a new Hive
        </Button>

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
              <Button
                key={m.id}
                variant="ghost"
                className="w-full justify-start text-sm text-slate-800"
                onClick={async () => {
                  if (!supabaseBrowserClient) {
                    setError("Supabase is not configured.");
                    return;
                  }
                  setError(null);
                  const { data: sessionData, error: sessionErr } =
                    await supabaseBrowserClient.auth.getSession();
                  if (sessionErr || !sessionData.session?.user?.id) {
                    setError(
                      sessionErr?.message ??
                        "We could not find your session. Please request a new magic link."
                    );
                    return;
                  }
                  const userId = sessionData.session.user.id;
                  const { error: upsertErr } = await supabaseBrowserClient
                    .from("hive_members")
                    .upsert({ hive_id: m.id, user_id: userId, role: "member" });
                  if (upsertErr) {
                    setError(upsertErr.message);
                    return;
                  }
                  router.push(`/hives/${m.slug ?? m.id}`);
                }}
              >
                {m.name}
              </Button>
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
