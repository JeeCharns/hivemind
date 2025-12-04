import { supabaseServerClient } from "@/lib/supabase/serverClient";
import HiveSettingsClient from "./settings-client";
import { fetchHiveByKey } from "@/lib/utils/slug";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function HiveSettingsPage({
  params,
}: {
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  const supabase = supabaseServerClient();
  const hiveKey = await fetchHiveByKey(supabase, hiveId);
  const { data: hive } = await supabase
    .from("hives")
    .select("name,logo_url,id")
    .eq("id", hiveKey.id)
    .maybeSingle();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Settings</h1>
      <HiveSettingsClient
        hiveId={hiveKey.id}
        initialName={hive?.name ?? ""}
        initialLogo={hive?.logo_url ?? null}
      />
    </div>
  );
}
