"use client";

"use client";

import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import type { CurrentUser } from "./user";

export function useCurrentUser() {
  const supabase = supabaseBrowserClient;
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setTimeout(() => {
        setUser(null);
        setLoading(false);
      }, 0);
      console.error("[useCurrentUser] supabase not configured");
      return;
    }

    let active = true;

    const loadProfile = async () => {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error) console.error("[useCurrentUser] getUser error", error);
      const authUser = auth.user;
      if (!authUser?.id || !authUser.email) {
        if (active) {
          console.warn("[useCurrentUser] no auth user");
          setUser(null);
        }
        return;
      }

      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (sessionErr) {
        console.error("[useCurrentUser] getSession error", sessionErr);
      } else {
        console.log("[useCurrentUser] getSession snapshot", {
          hasSession: !!sessionData.session,
          sessionUser: sessionData.session?.user?.id,
        });
      }
      if (!sessionData?.session) {
        if (active) {
          console.warn("[useCurrentUser] no session found after getUser");
          setUser(null);
        }
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("display_name,avatar_path")
        .eq("id", authUser.id)
        .maybeSingle();
      if (profileErr) {
        console.error("[useCurrentUser] profile fetch error", profileErr);
      }
      console.log("[useCurrentUser] auth user + profile", {
        authId: authUser.id,
        email: authUser.email,
        profile,
      });

      if (active) {
        setUser({
          id: authUser.id,
          email: authUser.email,
          displayName: profile?.display_name ?? authUser.email,
          avatarPath: profile?.avatar_path ?? null,
        });
      }
    };

    loadProfile().finally(() => {
      if (active) setLoading(false);
    });

    // IMPORTANT: no onAuthStateChange subscription for this test
    return () => {
      active = false;
    };
  }, [supabase]);

  return { user, loading };
}
