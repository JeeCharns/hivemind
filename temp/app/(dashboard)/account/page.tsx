"use client";

import { useEffect, useState } from "react";
import Card from "@/components/card";
import AccountClient from "./account-client";
import { useCurrentUser } from "@/lib/utils/use-current-user";
import { supabaseBrowserClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const { user, loading } = useCurrentUser();
  const supabase = supabaseBrowserClient;
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  useEffect(() => {
    if (!user || !supabase) return;
    let active = true;
    const loadAvatar = async () => {
      setAvatarLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("avatar_path")
        .eq("id", user.id)
        .maybeSingle();
      if (active) {
        const avatar = (data as { avatar_path: string | null } | null)
          ?.avatar_path;
        setAvatarPath(avatar ?? null);
        setAvatarLoading(false);
      }
    };
    void loadAvatar();
    return () => {
      active = false;
    };
  }, [user, supabase]);

  if (loading || avatarLoading) {
    return (
      <Card className="w-full" padding="p-8">
        <div className="h-6 w-40 rounded bg-slate-200 animate-pulse mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
          <div className="h-24 w-full rounded bg-slate-200 animate-pulse" />
        </div>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="w-full" padding="p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          Account settings
        </h1>
        <p className="text-sm text-slate-600">
          You need to be signed in to manage your account.
        </p>
      </Card>
    );
  }

  return (
    <Card className="w-full" padding="p-8">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">
        Account settings
      </h1>
      <AccountClient userId={user.id} initialAvatarPath={avatarPath} />
    </Card>
  );
}
