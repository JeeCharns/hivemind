/**
 * Responsive Breakpoint Hooks
 *
 * Detects viewport size using matchMedia for efficient, reactive breakpoint detection.
 * Uses useSyncExternalStore for proper React 18 concurrent rendering support.
 */

"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768; // md
const TABLET_BREAKPOINT = 1024; // lg

// Helper to create breakpoint detection
function createBreakpointHook(breakpoint: number) {
  const getSnapshot = (): boolean => {
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  };

  const getServerSnapshot = (): boolean => false;

  const subscribe = (callback: () => void): (() => void) => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    mediaQuery.addEventListener("change", callback);
    return () => mediaQuery.removeEventListener("change", callback);
  };

  return { getSnapshot, getServerSnapshot, subscribe };
}

const mobileHook = createBreakpointHook(MOBILE_BREAKPOINT);
const tabletHook = createBreakpointHook(TABLET_BREAKPOINT);

/**
 * Returns true when viewport is below md breakpoint (768px)
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    mobileHook.subscribe,
    mobileHook.getSnapshot,
    mobileHook.getServerSnapshot
  );
}

/**
 * Returns true when viewport is below lg breakpoint (1024px)
 * Use for layouts that should be "mobile-like" on tablets too
 */
export function useIsMobileOrTablet(): boolean {
  return useSyncExternalStore(
    tabletHook.subscribe,
    tabletHook.getSnapshot,
    tabletHook.getServerSnapshot
  );
}
