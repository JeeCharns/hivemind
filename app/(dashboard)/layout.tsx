import AuthGuard from "@/components/auth-guard";
import Navbar from "@/components/navbar";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { DEFAULT_HIVE_ID, DEFAULT_USER_ID } from "@/lib/config";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServerClient();
  const [{ data: profile }, { data: hive }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", DEFAULT_USER_ID)
      .maybeSingle(),
    supabase
      .from("hives")
      .select("name")
      .eq("id", DEFAULT_HIVE_ID)
      .maybeSingle(),
  ]);

  return (
    <AuthGuard>
      <Navbar profileName={profile?.display_name} hiveName={hive?.name} />
      <main className="min-h-screen bg-[#E8EAF3] pt-24 pb-16 overflow-y-auto no-scrollbar">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12">
          {children}
        </div>
      </main>
    </AuthGuard>
  );
}
