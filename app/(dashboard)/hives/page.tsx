import Link from "next/link";
import { DEFAULT_HIVE_ID } from "@/lib/config";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import NewSessionLauncher from "@/components/new-session-launcher";

type Conversation = {
  id: string;
  title: string;
  phase: string;
  type: "understand" | "decide";
  created_at: string;
  analysis_status: string | null;
  report_json: unknown | null;
  description: string | null;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "26 Nov 25";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "26 Nov 25";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
};

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function HivesPage() {
  const supabase = supabaseServerClient();
  const [{ data: hive }, { data: conversations }] = await Promise.all([
    supabase
      .from("hives")
      .select("name")
      .eq("id", DEFAULT_HIVE_ID)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select(
        "id,title,phase,type,created_at,analysis_status,report_json,description"
      )
      .eq("hive_id", DEFAULT_HIVE_ID)
      .order("created_at", { ascending: false }),
  ]);

  const rows: Conversation[] = (conversations ?? []) as Conversation[];
  const hiveName = hive?.name ?? "Hive";
  const ctaFor = (row: Conversation) => {
    const base = `/hives/${DEFAULT_HIVE_ID}/conversations/${row.id}`;
    if (row.report_json) {
      return { label: "Result ready", href: `${base}/result` };
    }
    if (row.analysis_status === "ready") {
      return { label: "Analysis complete", href: `${base}/understand` };
    }
    return { label: "Submit your thoughts!", href: `${base}/listen` };
  };

  return (
    <div className="mx-auto max-w-[1440px] relative flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] leading-[41px] pt-8 font-medium text-[#172847]">
              {hiveName}
            </h1>
            <p className="text-sm leading-5 font-normal text-[#566888]">
              Your collective intelligence sessions live here
            </p>
          </div>
          <NewSessionLauncher />
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map((row) => {
            const cta = ctaFor(row);
            return (
              <article
                key={row.id}
                className="flex flex-col justify-between bg-white rounded-2xl border border-[#E6E9F2] p-6 min-h-[260px] shadow-sm"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <span className="inline-flex items-center gap-2 px-2 py-1 bg-[#FFF1EB] text-[#E46E00] text-[12px] leading-6 font-semibold rounded">
                      {row.type === "decide"
                        ? "SOLUTION SPACE"
                        : "PROBLEM SPACE"}
                    </span>
                    <span className="text-sm font-medium text-[#566888]">
                      {formatDate(row.created_at)}
                    </span>
                  </div>
                  <h3 className="text-xl font-medium text-[#172847]">
                    {row.title}
                  </h3>
                  {row.description ? (
                    <p className="text-sm leading-[1.4] font-normal text-[#566888]">
                      {row.description}
                    </p>
                  ) : null}
                </div>

                <Link
                  href={cta.href}
                  className="mt-6 bg-[#EDEFFD] hover:bg-[#dfe3ff] text-[#3A1DC8] text-sm font-medium leading-6 rounded-sm py-2 px-4 text-center transition-colors"
                >
                  {cta.label} →
                </Link>
              </article>
            );
          })}

          <NewSessionLauncher asCard />
        </div>
      </section>
    </div>
  );
}
