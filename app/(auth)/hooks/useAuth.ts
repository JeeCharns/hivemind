"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { notifySessionChange } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";

interface UseAuthReturn {
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for authentication operations
 * Handles OTP send/verify, password login, logout, and manages auth state
 */
export const useAuth = (): UseAuthReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refresh } = useSession();

  const sendOtp = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          // No emailRedirectTo = sends 6-digit code instead of magic link
        },
      });

      if (signInError) throw signInError;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send verification code";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(
    async (email: string, token: string) => {
      setLoading(true);
      setError(null);

      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });

        if (verifyError) throw verifyError;

        // Refresh session store and notify other tabs
        await refresh();
        notifySessionChange();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to verify code";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refresh]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        // For OTP authentication (empty password)
        if (!password) {
          await sendOtp(email);
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
    },
    [refresh, router, sendOtp]
  );

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
    sendOtp,
    verifyOtp,
    login,
    logout,
    loading,
    error,
  };
};
