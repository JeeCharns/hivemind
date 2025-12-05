import { supabaseServerClient } from "@/lib/supabase/serverClient";
import AccountClient from "./account-client";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/utils/user";
import Card from "@/components/card";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = supabaseServerClient();
  const currentUser = await getCurrentUserProfile(supabase);
  if (!currentUser) {
    redirect("/");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", currentUser.id)
    .maybeSingle();

  return (
    <Card className="w-full" padding="p-8">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">
        Account settings
      </h1>
      <AccountClient
        userId={currentUser.id}
        initialAvatarPath={profile?.avatar_path ?? null}
      />
    </Card>
  );
}
