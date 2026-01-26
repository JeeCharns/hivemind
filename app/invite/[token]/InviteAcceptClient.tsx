"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/app/components/spinner";
import CenteredCard from "@/app/components/centered-card";
import BrandLogo from "@/app/components/brand-logo";
import Alert from "@/app/components/alert";

interface InviteAcceptClientProps {
  token: string;
  hiveName: string;
}

/**
 * Client component for authenticated users to accept an invite.
 * Calls the accept API and redirects to the hive on success.
 */
export default function InviteAcceptClient({
  token,
  hiveName,
}: InviteAcceptClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const acceptInvite = useCallback(async () => {
    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const errorMessage =
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "Failed to accept invite";
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const hiveKey = data?.hiveKey;

      if (!hiveKey) {
        throw new Error("Invalid response from server");
      }

      // Redirect to hive
      router.push(`/hives/${hiveKey}`);
    } catch (err) {
      console.error("[InviteAcceptClient] Error accepting invite:", err);
      setError(err instanceof Error ? err.message : "Failed to accept invite");
      setAccepting(false);
    }
  }, [token, router]);

  useEffect(() => {
    acceptInvite();
  }, [acceptInvite]);

  return (
    <div className="min-h-screen w-full bg-[#F0F0F5] flex flex-col items-center justify-center relative overflow-hidden px-4 py-12">
      <div className="mb-12">
        <BrandLogo size={42} />
      </div>

      <CenteredCard
        className="items-center gap-4 shadow-md border border-[#E2E8F0] p-8"
        widthClass="max-w-full"
        style={{ width: 473, maxWidth: "100%" }}
      >
        {error ? (
          <>
            <h1
              className="text-center text-[#172847] text-2xl font-semibold leading-[31px]"
              style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}
            >
              Unable to Join Hive
            </h1>
            <Alert variant="error">{error}</Alert>
          </>
        ) : (
          <>
            <h1
              className="text-center text-[#172847] text-2xl font-semibold leading-[31px]"
              style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}
            >
              {accepting ? `Joining ${hiveName}...` : "Processing Invite..."}
            </h1>
            <div className="w-full flex justify-center py-8">
              <Spinner />
            </div>
          </>
        )}
      </CenteredCard>
    </div>
  );
}
