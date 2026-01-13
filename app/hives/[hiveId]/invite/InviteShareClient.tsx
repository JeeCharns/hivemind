"use client";

/**
 * InviteShareClient - Client Component for Invite/Share Page
 *
 * Renders the share panel with error handling via Alert.
 * Receives server-computed props (hiveKey, isAdmin, initialError).
 */

import Link from "next/link";
import Alert from "@/app/components/alert";
import Button from "@/app/components/button";
import HiveShareInvitePanel from "@/app/hives/components/HiveShareInvitePanel";

interface InviteShareClientProps {
  hiveKey: string;
  isAdmin: boolean;
  initialError?: string | null;
}

export default function InviteShareClient({
  hiveKey,
  isAdmin,
  initialError,
}: InviteShareClientProps) {
  return (
    <div className="min-h-screen bg-[#F7F8FB] p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div className="mb-6">
            <Link href={`/hives/${hiveKey}`}>
              <Button variant="ghost" size="sm">
                ← Back to Hive
              </Button>
            </Link>
          </div>

          <h1 className="text-2xl font-semibold text-[#172847] mb-6">
            Share / Invite
          </h1>

          {initialError && (
            <div className="mb-6">
              <Alert variant="error">{initialError}</Alert>
            </div>
          )}

          <HiveShareInvitePanel hiveKey={hiveKey} isAdmin={isAdmin} />

          <div className="mt-8 pt-6 border-t border-slate-200">
            <Link href={`/hives/${hiveKey}`}>
              <Button variant="secondary" className="w-full">
                Done
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
