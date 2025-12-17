/**
 * Settings Layout
 *
 * Fixed navbar layout for account settings pages
 * No hive context needed - renders navbar without hive-specific data
 */

import type { ReactNode } from "react";
import { getNavbarViewModel } from "@/lib/navbar/getNavbarViewModel";
import Navbar from "@/app/components/Navbar";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Fetch navbar data without hive context
  const navbarViewModel = await getNavbarViewModel({});

  return (
    <>
      <Navbar viewModel={navbarViewModel} />
      <div className="pt-16 min-h-screen">{children}</div>
    </>
  );
}
