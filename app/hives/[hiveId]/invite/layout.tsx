/**
 * Invite Page Layout
 *
 * Wraps invite page to provide correct navbar context
 */

import type { ReactNode } from "react";

export default async function InviteLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Parent layout handles navbar with currentPage detection from URL
  return <>{children}</>;
}
