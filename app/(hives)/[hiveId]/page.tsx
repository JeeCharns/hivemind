"use client";

/**
 * Hive Overview Page
 *
 * Thin orchestration layer - delegates business logic to useHiveOverview hook
 */

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHiveOverview } from "@/lib/hives/react/useHiveOverview";
import { getLogoSignedUrl } from "@/lib/supabase/storage";
import Spinner from "@/app/components/spinner";
import Button from "@/app/components/button";
import HiveLogo from "@/app/components/hive-logo";

export default function Page({ params }: { params: Promise<{ hiveId: string }> }) {
  const { hiveId } = use(params);
  const router = useRouter();
  const { hive, stats, isLoading, error } = useHiveOverview(hiveId);
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hive?.logo_url) {
      setLogoSignedUrl(null);
      return;
    }

    let cancelled = false;

    getLogoSignedUrl(hive.logo_url).then((url) => {
      if (!cancelled) {
        setLogoSignedUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hive?.logo_url]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <Spinner />
      </div>
    );
  }

  if (error || !hive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error?.message || "Hive not found"}</p>
          <Button variant="secondary" onClick={() => router.push("/")}>
            Back to Hives
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FB] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <HiveLogo src={logoSignedUrl} name={hive.name} size={64} />
              <div>
                <h1 className="text-3xl font-semibold text-[#172847]">{hive.name}</h1>
                <p className="text-sm text-[#566175]">Hive ID: {hive.slug || hive.id}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/${hiveId}/settings`)}
              >
                Settings
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push(`/${hiveId}/invite`)}
              >
                Invite Members
              </Button>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-[#566175] mb-1">Conversations</p>
                <p className="text-2xl font-semibold text-[#172847]">
                  {stats.conversationsCount}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-[#566175] mb-1">Members</p>
                <p className="text-2xl font-semibold text-[#172847]">
                  {stats.membersCount}
                </p>
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="border-t border-slate-200 pt-6">
            <p className="text-[#566175] text-center">
              Hive dashboard content will go here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
