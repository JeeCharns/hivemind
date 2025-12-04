import AuthGuard from "@/components/auth-guard";
import Navbar from "@/components/navbar";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_USER_ID } from "@/lib/config";
import { fetchHiveByKey } from "@/lib/utils/slug";

export default async function HiveLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  return <HiveShell hiveKey={hiveId}>{children}</HiveShell>;
}

async function HiveShell({
  children,
  hiveKey,
}: {
  children: React.ReactNode;
  hiveKey: string;
}) {
  const supabase = supabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? DEFAULT_USER_ID;
  const hive = await fetchHiveByKey(supabase, hiveKey);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,avatar_path")
    .eq("id", userId)
    .maybeSingle();
  const { data: hiveDetails } = await supabase
    .from("hives")
    .select("logo_url,name,slug,id")
    .eq("id", hive.id)
    .maybeSingle();

  return (
    <AuthGuard>
      <Navbar
        profileName={profile?.display_name}
        profileAvatarPath={profile?.avatar_path ?? null}
        hiveName={hiveDetails?.name ?? hive.name}
        hiveLogo={hiveDetails?.logo_url ?? null}
        hiveId={hive.id}
        hiveSlug={hive.slug ?? hiveDetails?.slug ?? null}
      />
      <main className="min-h-screen bg-[#E8EAF3] overflow-y-auto no-scrollbar">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </AuthGuard>
  );
}
