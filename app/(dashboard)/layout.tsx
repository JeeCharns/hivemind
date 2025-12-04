import AuthGuard from "@/components/auth-guard";
import Navbar from "@/components/navbar";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_HIVE_ID, DEFAULT_USER_ID } from "@/lib/config";
import { cookies } from "next/headers";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServerClient();
  const cookieStore = await cookies();
  const entry = cookieStore.get("last_hive_id");
  const lastHiveId = entry?.value;
  const effectiveHiveId = lastHiveId || DEFAULT_HIVE_ID;
  const [{ data: profile }, { data: hive }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,avatar_path")
      .eq("id", DEFAULT_USER_ID)
      .maybeSingle(),
    supabase
      .from("hives")
      .select("name,logo_url")
      .eq("id", effectiveHiveId)
      .maybeSingle(),
  ]);

  return (
    <AuthGuard>
      <Navbar
        profileName={profile?.display_name}
        profileAvatarPath={profile?.avatar_path ?? null}
        hiveName={hive?.name}
        hiveLogo={hive?.logo_url ?? null}
        hiveId={effectiveHiveId}
      />
      <main className="min-h-screen bg-[#E8EAF3] pt-24 pb-16 overflow-y-auto no-scrollbar">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12">
          {children}
        </div>
      </main>
    </AuthGuard>
  );
}
