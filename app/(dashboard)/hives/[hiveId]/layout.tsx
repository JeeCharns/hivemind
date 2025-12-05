import AuthGuard from "@/components/auth-guard";
import Navbar from "@/components/navbar";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { fetchHiveByKey } from "@/lib/utils/slug";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/utils/user";

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
  const currentUser = await getCurrentUserProfile(supabase);
  if (!currentUser) redirect("/");
  const hive = await fetchHiveByKey(supabase, hiveKey);

  const { data: hiveDetails } = await supabase
    .from("hives")
    .select("logo_url,name,slug,id")
    .eq("id", hive.id)
    .maybeSingle();

  return (
    <AuthGuard>
      <Navbar
        profileName={currentUser.displayName}
        profileAvatarPath={currentUser.avatarPath}
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
