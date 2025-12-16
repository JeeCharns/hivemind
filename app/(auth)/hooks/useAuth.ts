"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { notifySessionChange } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";

interface UseAuthReturn {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for authentication operations
 * Handles login, logout, and manages auth state
 */
export const useAuth = (): UseAuthReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refresh } = useSession();

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      // For Supabase magic link authentication
      if (!password) {
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/callback`,
          },
        });

        if (signInError) throw signInError;

        // Success - user will receive email
        return;
      }

      // For password-based authentication
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Refresh session store and notify other tabs
      await refresh();
      notifySessionChange();

      // Redirect to dashboard or last visited hive
      router.push("/hives");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to login";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refresh, router]);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      // Refresh session store and notify other tabs
      await refresh();
      notifySessionChange();

      // Redirect to login
      router.push("/login");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to logout";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [refresh, router]);

  return {
    login,
    logout,
    loading,
    error,
  };
};
