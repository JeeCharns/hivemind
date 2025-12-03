"use server";

import { redirect } from "next/navigation";
import AuthGate from "@/components/auth-gate";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

export default async function Home() {
  const supabase = supabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    redirect("/hives");
  }
  return <AuthGate />;
}
