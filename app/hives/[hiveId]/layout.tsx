/**
 * Hive Layout
 *
 * Server component that wraps /hives/:hiveId and all child routes
 * Fetches navbar data with hive context and renders navbar + children
 */

import type { ReactNode } from "react";
import { getNavbarViewModel } from "@/lib/navbar/getNavbarViewModel";
import Navbar from "@/app/components/Navbar";

export default async function HiveLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ hiveId: string }>;
}) {
  const { hiveId } = await params;

  // Fetch navbar data with hive context on server
  const navbarViewModel = await getNavbarViewModel({ hiveKey: hiveId });

  return (
    <>
      <Navbar viewModel={navbarViewModel} />
      {/* Add top padding to account for fixed navbar */}
      <div className="pt-4 min-h-screen">{children}</div>
    </>
  );
}
