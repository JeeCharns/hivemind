import { supabaseServerClient } from "@/lib/supabase/serverClient";
import NewSessionLauncher from "@/components/new-session-launcher";
import { fetchHiveByKey } from "@/lib/utils/slug";
import { ConversationCardRow } from "@/lib/utils/hive-cards";
import ConversationCard from "@/components/conversation-card";
import Card from "@/components/card";
import HiveClientGuard from "./client-guard";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function HivePage({
  params,
}: {
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  const supabase = supabaseServerClient();
  console.log("[hive-page] params hiveId", hiveId);
  const hiveKey = await fetchHiveByKey(supabase, hiveId);
  console.log("[hive-page] resolved hiveKey", hiveKey);
  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id,slug,title,phase,type,created_at,analysis_status,report_json,description"
    )
    .eq("hive_id", hiveKey.id)
    .order("created_at", { ascending: false });
  console.log("[hive-page] conversations count", conversations?.length ?? 0);
  if ((conversations?.length ?? 0) === 0) {
    console.warn("[hive-page] no conversations found for hive", hiveKey.id);
  }
  if (conversations && conversations.length) {
    console.log("[hive-page] first conversation preview", conversations[0]);
  }

  const rows: ConversationCardRow[] = (conversations ?? []) as ConversationCardRow[];
  const hiveName = hiveKey.name ?? "Hive";

  return (
    <HiveClientGuard>
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
            <NewSessionLauncher hiveId={hiveKey.id} hiveSlug={hiveKey.slug ?? null} />
          </div>
        </header>

        <section className="flex flex-col gap-6">
          <Card className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" padding="p-4" shadow={false}>
            {rows.map((row) => (
              <ConversationCard key={row.id} hive={hiveKey} conversation={row} />
            ))}
            <NewSessionLauncher asCard hiveId={hiveKey.id} hiveSlug={hiveKey.slug ?? null} />
          </Card>
        </section>
      </div>
    </HiveClientGuard>
  );
}
