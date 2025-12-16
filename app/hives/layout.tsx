/**
 * Hives Layout
 *
 * Server component that wraps /hives and all child routes
 * Fetches navbar data and renders navbar + children
 */

import { getNavbarViewModel } from "@/lib/navbar/getNavbarViewModel";
import Navbar from "@/app/components/Navbar";

export default async function HivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch navbar data on server
  const navbarViewModel = await getNavbarViewModel();

  return (
    <>
      <Navbar viewModel={navbarViewModel} />
      {/* Add top padding to account for fixed navbar */}
      <div className="pt-16">
        {children}
      </div>
    </>
  );
}
