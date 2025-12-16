/**
 * Settings Page Layout
 *
 * Wraps settings page to provide correct navbar context
 */

import type { ReactNode } from "react";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Parent layout handles navbar with currentPage detection from URL
  return <>{children}</>;
}
