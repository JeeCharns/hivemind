/**
 * Hives Home - Presentational Component
 *
 * Displays list of hives with create functionality
 * Follows SRP: only responsible for UI rendering and user interactions
 * All data comes from props (server or parent component)
 */

"use client";

import { useRouter } from "next/navigation";
import type { HiveWithSignedUrl } from "@/lib/hives/server/getHivesWithSignedUrls";
import JoinHiveSearch from "@/app/hives/components/JoinHiveSearch";
import Button from "@/app/components/button";
import HiveLogo from "@/app/components/hive-logo";

interface HivesHomeProps {
  hives: HiveWithSignedUrl[];
  error: string | null;
}

export default function HivesHome({ hives, error }: HivesHomeProps) {
  const router = useRouter();

  const handleHiveClick = (hive: HiveWithSignedUrl) => {
    // Prefer slug over ID for cleaner URLs
    const hiveKey = hive.slug || hive.id;
    router.push(`/hives/${hiveKey}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 pb-8 relative">
      <div className="w-full max-w-[480px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
        <h1 className="text-h2 text-text-primary">Your Hives</h1>
        <p className="text-body text-text-secondary text-center">
          {hives.length > 0
            ? "Select a hive to continue."
            : "Create your first hive to get started."}
        </p>

        {error ? (
          <div className="w-full text-body text-red-600 text-center py-4 border border-red-200 bg-red-50 rounded-lg">
            {error}
          </div>
        ) : (
          <div className="w-full flex flex-col gap-3">
            {hives.map((hive) => (
              <button
                key={hive.id}
                type="button"
                onClick={() => handleHiveClick(hive)}
                className="w-full border border-slate-200 rounded-lg px-4 py-6 hover:border-indigo-200 transition flex items-center gap-2 text-left"
              >
                <HiveLogo src={hive.logo_url} name={hive.name} size={48} />
                <div className="text-subtitle text-slate-800 truncate">
                  {hive.name ?? "Hive"}
                </div>
              </button>
            ))}

            <Button className="w-full py-4" onClick={() => router.push("/hives/new")}>
              Create a New Hive
            </Button>

            {/* Join search block (matches temp welcome page styling/text) */}
            <JoinHiveSearch showMembershipStatus={false} disableAlreadyMember={false} />
          </div>
        )}
      </div>
    </div>
  );
}
