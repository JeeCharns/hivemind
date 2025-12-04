import { supabaseServerClient } from "@/lib/supabase/serverClient";
import AccountClient from "./account-client";
import { redirect } from "next/navigation";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = supabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    redirect("/");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Account settings</h1>
      <AccountClient userId={userId} initialAvatarPath={profile?.avatar_path ?? null} />
    </div>
  );
}
