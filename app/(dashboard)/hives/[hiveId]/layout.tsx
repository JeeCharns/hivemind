import AuthGuard from "@/components/auth-guard";
import Navbar from "@/components/navbar";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_USER_ID } from "@/lib/config";

export default async function HiveLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;
  return <HiveShell hiveId={hiveId}>{children}</HiveShell>;
}

async function HiveShell({
  children,
  hiveId,
}: {
  children: React.ReactNode;
  hiveId: string;
}) {
  const supabase = supabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? DEFAULT_USER_ID;

  const [{ data: profile }, { data: hive }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,avatar_path")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("hives")
      .select("name,logo_url")
      .eq("id", hiveId)
      .maybeSingle(),
  ]);

  return (
    <AuthGuard>
      <Navbar
        profileName={profile?.display_name}
        profileAvatarPath={profile?.avatar_path ?? null}
        hiveName={hive?.name}
        hiveLogo={hive?.logo_url ?? null}
        hiveId={hiveId}
      />
      <main className="min-h-screen bg-[#E8EAF3] overflow-y-auto no-scrollbar">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </AuthGuard>
  );
}
