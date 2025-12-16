"use client";

/**
 * Hive Invite Page
 *
 * Thin orchestration layer - delegates business logic to useInvites hook
 */

import { use } from "react";
import { useRouter } from "next/navigation";
import { useInvites } from "@/lib/hives/react/useInvites";
import Spinner from "@/app/components/spinner";
import Button from "@/app/components/button";
import InviteForm from "../../components/InviteForm";

export default function Page({ params }: { params: Promise<{ hiveId: string }> }) {
  const { hiveId } = use(params);
  const router = useRouter();
  const { invites, isLoading, createInvite, revokeInvite, isCreating } = useInvites(hiveId);

  const handleInvite = async (emails: string[]) => {
    try {
      await createInvite(emails);
      // Success message could be shown here
      alert("Invites sent successfully!");
    } catch (err) {
      console.error("Failed to send invites:", err);
      alert("Failed to send invites. Please try again.");
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (window.confirm("Are you sure you want to revoke this invite?")) {
      try {
        await revokeInvite(inviteId);
      } catch (err) {
        console.error("Failed to revoke invite:", err);
        alert("Failed to revoke invite. Please try again.");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FB]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FB] p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${hiveId}`)}
            >
              ← Back to Hive
            </Button>
          </div>

          <h1 className="text-3xl font-semibold text-[#172847] mb-6">Invite Members</h1>

          <div className="space-y-8">
            {/* Invite Form */}
            <div>
              <h2 className="text-lg font-semibold text-[#172847] mb-4">Send New Invites</h2>
              <InviteForm
                onSubmit={handleInvite}
                isSubmitting={isCreating}
                error={null}
              />
            </div>

            {/* Pending Invites List */}
            <div className="border-t border-slate-200 pt-8">
              <h2 className="text-lg font-semibold text-[#172847] mb-4">Pending Invites</h2>
              {invites.length === 0 ? (
                <p className="text-sm text-[#566175]">No pending invites.</p>
              ) : (
                <div className="space-y-2">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-4 border border-slate-200 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#172847]">{invite.email}</p>
                        <p className="text-xs text-[#566175]">
                          Status: {invite.status} • Sent{" "}
                          {new Date(invite.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRevoke(invite.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
