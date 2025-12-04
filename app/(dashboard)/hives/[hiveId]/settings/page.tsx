import { supabaseServerClient } from "@/lib/supabase/serverClient";
import HiveSettingsClient from "./settings-client";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function HiveSettingsPage({
  params,
}: {
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  const supabase = supabaseServerClient();
  const { data: hive } = await supabase
    .from("hives")
    .select("name,logo_url")
    .eq("id", hiveId)
    .maybeSingle();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Settings</h1>
      <HiveSettingsClient
        hiveId={hiveId}
        initialName={hive?.name ?? ""}
        initialLogo={hive?.logo_url ?? null}
      />
    </div>
  );
}
