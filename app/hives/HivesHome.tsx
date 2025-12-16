/**
 * Hives Home - Presentational Component
 *
 * Displays list of hives with create functionality
 * Follows SRP: only responsible for UI rendering and user interactions
 * All data comes from props (server or parent component)
 */

"use client";

import { useState } from "react";
import type { HiveWithSignedUrl } from "@/lib/hives/server/getHivesWithSignedUrls";
import CreateHiveForm from "@/app/(hives)/components/CreateHiveForm";
import Button from "@/app/components/button";
import HiveLogo from "@/app/components/hive-logo";

interface HivesHomeProps {
  hives: HiveWithSignedUrl[];
  error: string | null;
}

export default function HivesHome({ hives, error }: HivesHomeProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateHive = async (name: string) => {
    setIsCreating(true);
    setCreateError(null);

    try {
      // Call the API to create a new hive
      const response = await fetch("/api/hives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create hive");
      }

      const newHive = await response.json();
      setShowCreateForm(false);

      // Navigate to the new hive using slug (or ID as fallback)
      const hiveKey = newHive.slug || newHive.id;
      window.location.href = `/hives/${hiveKey}`;
    } catch (err) {
      console.error("Failed to create hive:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create hive"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleHiveClick = (hive: HiveWithSignedUrl) => {
    // Prefer slug over ID for cleaner URLs
    const hiveKey = hive.slug || hive.id;
    window.location.href = `/hives/${hiveKey}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 pb-8 relative">
      <div className="w-full max-w-[480px] bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold text-[#172847]">Your Hives</h1>
        <p className="text-sm text-[#566175] text-center">
          {hives.length > 0
            ? "Select a hive to continue."
            : "Create your first hive to get started."}
        </p>

        {error ? (
          <div className="w-full text-sm text-red-600 text-center py-4 border border-red-200 bg-red-50 rounded-lg">
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
                <div className="text-sm font-medium text-slate-800 truncate">
                  {hive.name ?? "Hive"}
                </div>
              </button>
            ))}

            {hives.length === 0 && !showCreateForm && (
              <div className="text-sm text-slate-500 text-center py-4">
                You are not a member of any hives yet.
              </div>
            )}

            {showCreateForm ? (
              <div className="space-y-3">
                <CreateHiveForm
                  onSubmit={handleCreateHive}
                  isSubmitting={isCreating}
                  error={createError}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateError(null);
                  }}
                  className="text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
                  disabled={isCreating}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                className="w-full py-4"
                onClick={() => setShowCreateForm(true)}
              >
                Create a New Hive
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
