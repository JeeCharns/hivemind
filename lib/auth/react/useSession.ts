"use client";

import { useContext } from "react";
import { SessionContext } from "./AuthProvider";
import type { Session, SessionStatus } from "../domain/session.types";

/**
 * Hook for reading session state
 * Safe to use anywhere - no redirects
 * Returns current session state and utilities
 */
export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within AuthProvider");
  }

  const { state, store } = context;

  return {
    /**
     * Current session status
     */
    status: state.status as SessionStatus,

    /**
     * Current session (null if not authenticated)
     */
    session: state.session as Session | null,

    /**
     * Current user (null if not authenticated)
     */
    user: state.session?.user ?? null,

    /**
     * Active hive ID (null if none)
     */
    activeHiveId: state.session?.activeHiveId ?? null,

    /**
     * User roles (empty array if none)
     */
    roles: state.session?.roles ?? [],

    /**
     * Error if session fetch failed
     */
    error: state.error,

    /**
     * Whether session is currently loading
     */
    isLoading: state.status === "loading",

    /**
     * Whether user is authenticated
     */
    isAuthenticated: state.status === "authenticated",

    /**
     * Whether user is unauthenticated
     */
    isUnauthenticated: state.status === "unauthenticated",

    /**
     * Manually refresh session
     */
    refresh: () => store.refresh(),
  };
}
