/**
 * Conversation Share Link Panel
 *
 * UI for generating, displaying, copying, and revoking
 * anonymous guest share links for a conversation.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShareLinkExpiry } from "@/types/guest-api";

interface ConversationShareLinkPanelProps {
  conversationId: string;
}

const EXPIRY_OPTIONS: { value: ShareLinkExpiry; label: string }[] = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "28d", label: "28 days" },
];

export default function ConversationShareLinkPanel({
  conversationId,
}: ConversationShareLinkPanelProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<ShareLinkExpiry>("7d");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing link on mount
  const fetchLink = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/share-link`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.url) {
        setUrl(data.url);
        setExpiresAt(data.expiresAt);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  // Create link
  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/share-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create link");
      }
      const data = await res.json();
      setUrl(data.url);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  // Revoke link
  const handleRevoke = async () => {
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/share-link`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error("Failed to revoke link");
      }
      setUrl(null);
      setExpiresAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke link");
    } finally {
      setRevoking(false);
    }
  };

  // Copy link
  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  };

  if (loading) {
    return (
      <div className="py-4 text-center text-body text-text-tertiary">
        Loading…
      </div>
    );
  }

  // Active link exists
  if (url) {
    const expiresDate = expiresAt ? new Date(expiresAt) : null;
    const isExpiringSoon =
      expiresDate &&
      expiresDate.getTime() - Date.now() < 24 * 60 * 60 * 1000;

    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text-secondary">
          Anyone with this link can participate anonymously in this conversation.
        </p>

        {/* URL display */}
        <div className="flex items-stretch gap-2">
          <div className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-body text-text-primary font-mono truncate">
            {url}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-subtitle text-text-primary hover:bg-slate-50 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Expiry info */}
        {expiresDate && (
          <p
            className={`text-caption ${isExpiringSoon ? "text-amber-600" : "text-text-tertiary"}`}
          >
            {isExpiringSoon ? "⚠ " : ""}Expires{" "}
            {expiresDate.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        {/* Revoke */}
        <button
          type="button"
          onClick={handleRevoke}
          disabled={revoking}
          className="inline-flex items-center self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-subtitle text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {revoking ? "Revoking…" : "Revoke link"}
        </button>

        {error && (
          <p className="text-caption text-red-600">{error}</p>
        )}
      </div>
    );
  }

  // No active link — show creation form
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary">
        Generate a temporary link that lets anyone participate anonymously in
        this conversation — no account required.
      </p>

      {/* Expiry selector */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="expiry-select"
          className="text-subtitle text-text-primary"
        >
          Expires after
        </label>
        <select
          id="expiry-select"
          value={expiresIn}
          onChange={(e) => setExpiresIn(e.target.value as ShareLinkExpiry)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-body text-text-primary"
        >
          {EXPIRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="inline-flex items-center self-start rounded-lg bg-brand-primary px-4 py-2 text-subtitle text-white hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
      >
        {creating ? "Generating…" : "Generate anonymous link"}
      </button>

      {error && (
        <p className="text-caption text-red-600">{error}</p>
      )}
    </div>
  );
}
