"use client";

/**
 * HiveShareInvitePanel - Shared Component
 *
 * Unified UI for sharing and inviting to hives.
 * Used by:
 * - Conversation Share modal
 * - Hive invite page
 * - Create-hive wizard step 2
 */

import { useEffect, useState, useCallback } from "react";
import Input from "@/app/components/input";
import Button from "@/app/components/button";
import Alert from "@/app/components/alert";
import Toast from "@/app/components/toast";

interface HiveShareInvitePanelProps {
  hiveKey: string;
  isAdmin: boolean;
  linkOnly?: boolean;
  onInvitesUpdated?: () => void;
}

type AccessMode = "anyone" | "invited_only";

export default function HiveShareInvitePanel({
  hiveKey,
  isAdmin,
  linkOnly = false,
  onInvitesUpdated,
}: HiveShareInvitePanelProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("anyone");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  // Invite emails state
  const [emailsText, setEmailsText] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchShareLink = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/hives/${hiveKey}/share-link`);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to fetch share link");
      }

      const data = await response.json();
      setShareUrl(data.url);
      setAccessMode(data.accessMode);
    } catch (err) {
      console.error("[HiveShareInvitePanel] Error fetching share link:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch share link"
      );
    } finally {
      setLoading(false);
    }
  }, [hiveKey]);

  // Fetch share link on mount
  useEffect(() => {
    fetchShareLink();
  }, [fetchShareLink]);

  const copyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast({ message: "Link copied", variant: "success" });
    } catch (err) {
      console.error("[HiveShareInvitePanel] Error copying link:", err);
      setError("Failed to copy link to clipboard");
    }
  };

  const updateAccessMode = async (newMode: AccessMode) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/hives/${hiveKey}/share-link`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessMode: newMode }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to update access mode");
      }

      setAccessMode(newMode);
      setToast({ message: "Access mode updated", variant: "success" });
    } catch (err) {
      console.error("[HiveShareInvitePanel] Error updating access mode:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update access mode"
      );
    }
  };

  const sendInvites = async () => {
    setInviting(true);
    setInviteError(null);

    const emails = emailsText
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emails.length === 0) {
      setInviteError("Please enter at least one email");
      setInviting(false);
      return;
    }

    if (emails.length > 10) {
      setInviteError("Cannot invite more than 10 emails at once");
      setInviting(false);
      return;
    }

    try {
      const response = await fetch(`/api/hives/${hiveKey}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emails }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to send invites");
      }

      setToast({
        message: `${emails.length} invite(s) sent`,
        variant: "success",
      });
      setEmailsText("");
      onInvitesUpdated?.();
    } catch (err) {
      console.error("[HiveShareInvitePanel] Error sending invites:", err);
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invites"
      );
    } finally {
      setInviting(false);
    }
  };

  const emailCount = emailsText
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0).length;

  if (loading) {
    return (
      <div className="w-full flex justify-center py-8">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Copy Link Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[#172847]">
            Share Link
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={copyLink}
            disabled={!shareUrl}
          >
            Copy link
          </Button>
        </div>

        {shareUrl && (
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 break-all font-mono">
            {shareUrl}
          </div>
        )}
      </div>

      {/* Access Mode Section (hidden in linkOnly mode) */}
      {!linkOnly && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[#172847]">
            Who has access
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accessMode"
                value="anyone"
                checked={accessMode === "anyone"}
                onChange={(e) => updateAccessMode(e.target.value as AccessMode)}
                disabled={!isAdmin}
                className="w-4 h-4"
              />
              <span className="text-sm text-[#172847]">Anyone</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accessMode"
                value="invited_only"
                checked={accessMode === "invited_only"}
                onChange={(e) => updateAccessMode(e.target.value as AccessMode)}
                disabled={!isAdmin}
                className="w-4 h-4"
              />
              <span className="text-sm text-[#172847]">Invited only</span>
            </label>
          </div>

          {!isAdmin && (
            <p className="text-xs text-slate-500">
              Only admins can change access settings.
            </p>
          )}
        </div>
      )}

      {/* Invited-only Email Input (hidden in linkOnly mode) */}
      {!linkOnly && accessMode === "invited_only" && isAdmin && (
        <div className="flex flex-col gap-3 p-4 bg-slate-50 border border-slate-200 rounded-md">
          <p className="text-sm text-slate-600">
            You still need to copy and share the link. These people will need to
            click it and create an account using the invited email to be added
            to the hive.
          </p>

          <Input
            label="Email Addresses (comma-separated)"
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            placeholder="user1@example.com, user2@example.com"
            disabled={inviting}
            helperText={`Enter up to 10 email addresses separated by commas. (${emailCount} entered)`}
          />

          {inviteError && (
            <div className="text-sm text-red-600 px-2">{inviteError}</div>
          )}

          <Button
            onClick={sendInvites}
            disabled={inviting || emailCount === 0 || emailCount > 10}
          >
            {inviting
              ? "Inviting..."
              : `Invite ${emailCount} ${emailCount !== 1 ? "people" : "person"}`}
          </Button>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
