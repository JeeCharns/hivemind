"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import type { SessionState, ISessionStore } from "../domain/session.types";
import { SessionStore } from "../state/sessionStore";
import { sessionClient } from "../data/sessionClient";

/**
 * Session context for app-wide auth state
 */
export const SessionContext = createContext<{
  state: SessionState;
  store: ISessionStore;
} | null>(null);

/**
 * AuthProvider component
 * Wires session store to React and provides context
 * Should be placed at app root
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new SessionStore(sessionClient));
  const [state, setState] = useState<SessionState>(store.getState());

  useEffect(() => {
    // Subscribe to store updates
    const unsubscribe = store.subscribe(setState);

    // Initial session fetch
    store.refresh();

    // Cross-tab sync with BroadcastChannel
    const channel = new BroadcastChannel("auth");
    channel.onmessage = (event) => {
      if (event.data === "refresh") {
        store.refresh();
      }
    };

    // Refresh on tab focus (optional)
    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        store.refresh();
      }
    };
    document.addEventListener("visibilitychange", handleFocus);

    // Listen for page show event (handles back/forward cache)
    const handlePageShow = (event: PageTransitionEvent) => {
      // If page is loaded from cache, refresh session
      if (event.persisted) {
        store.refresh();
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      unsubscribe();
      channel.close();
      document.removeEventListener("visibilitychange", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [store]);

  return (
    <SessionContext.Provider value={{ state, store }}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Notify other tabs to refresh session
 * Call after login/logout
 */
export function notifySessionChange() {
  try {
    const channel = new BroadcastChannel("auth");
    channel.postMessage("refresh");
    channel.close();
  } catch (error) {
    // BroadcastChannel not supported, ignore
    console.warn("BroadcastChannel not supported:", error);
  }
}
