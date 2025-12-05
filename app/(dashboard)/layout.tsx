import AuthGuard from "@/components/auth-guard";
import Navbar from "@/components/navbar";
import { cookies } from "next/headers";
import { fetchHiveByKey } from "@/lib/utils/slug";
import { redirect } from "next/navigation";
import { createSupabaseServerComponentClient } from "@/lib/supabase/serverComponentClient";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerComponentClient();
  const cookieStore = await cookies();
  const entry = cookieStore.get("last_hive_id");
  const lastHiveId = entry?.value;
  console.log("[dashboard-layout] last_hive_id cookie", lastHiveId);
  if (!lastHiveId) {
    console.error(
      "[dashboard-layout] no last_hive_id cookie, redirecting to /hives"
    );
    redirect("/hives");
  }
  let hiveResolved;
  try {
    hiveResolved = await fetchHiveByKey(supabase, lastHiveId);
    console.log("[dashboard-layout] hive resolved", hiveResolved);
  } catch {
    console.error(
      "[dashboard-layout] failed to resolve hive from cookie",
      lastHiveId
    );
    redirect("/hives");
  }
  const { data: hive } = await supabase
    .from("hives")
    .select("id,slug,name,logo_url")
    .eq("id", hiveResolved.id)
    .maybeSingle();

  return (
    <AuthGuard>
      <Navbar
        profileName={undefined}
        profileAvatarPath={null}
        hiveName={hive?.name}
        hiveLogo={hive?.logo_url ?? null}
        hiveId={hive?.id ?? hiveResolved.id}
        hiveSlug={hive?.slug ?? hiveResolved.slug ?? null}
      />
      <main className="min-h-screen bg-[#E8EAF3] pt-24 pb-16 overflow-y-auto no-scrollbar">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12">
          {children}
        </div>
      </main>
    </AuthGuard>
  );
}
