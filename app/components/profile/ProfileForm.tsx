/**
 * ProfileForm - Shared Client Component
 *
 * Reusable form for updating user profile (display name + avatar)
 * Used in both profile setup and account settings
 * Follows SRP: UI only, accepts onSuccess callback for routing logic
 */

"use client";

import { useState } from "react";
import ImageUpload from "@/app/components/ImageUpload";
import Button from "@/app/components/button";

interface ProfileFormProps {
  initialDisplayName?: string | null;
  initialAvatarUrl?: string | null;
  submitLabel?: string;
  successMessage?: string;
  apiEndpoint?: string;
  onSuccess?: () => void;
  showSuccessMessage?: boolean;
}

export default function ProfileForm({
  initialDisplayName,
  initialAvatarUrl,
  submitLabel = "Save Changes",
  successMessage = "Profile updated successfully",
  apiEndpoint = "/api/profile",
  onSuccess,
  showSuccessMessage = false,
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialAvatarUrl ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // Build form data
      const formData = new FormData();
      formData.append("displayName", displayName.trim());
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      // Submit to API
      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? "Failed to save profile");
      }

      const data = await response.json().catch(() => null);
      if (data && typeof data === "object" && "avatarUrl" in data) {
        const nextAvatarUrl = (data as { avatarUrl?: unknown }).avatarUrl;
        if (typeof nextAvatarUrl === "string" || nextAvatarUrl === null) {
          setAvatarUrl(nextAvatarUrl);
        }
      }

      // Show success state
      if (showSuccessMessage) {
        setSuccess(true);
        // Clear avatar file selection after successful upload
        setAvatarFile(null);
      }

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("[ProfileForm] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      {/* Display Name Input */}
      <div className="space-y-2">
        <label
          htmlFor="displayName"
          className="block text-sm font-medium text-slate-700"
        >
          Display Name <span className="text-red-500">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your name"
          required
          maxLength={60}
          className="w-full h-10 border border-slate-300 rounded-md px-3 text-sm text-slate-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
          disabled={loading}
        />
        <p className="text-xs text-slate-500">
          This is how others will see you in the app
        </p>
      </div>

      {/* Avatar Upload */}
      <ImageUpload
        label="Profile Picture (optional)"
        value={avatarFile}
        initialUrl={avatarUrl}
        onChange={setAvatarFile}
        maxSizeMB={2}
      />

      {/* Success Message */}
      {success && showSuccessMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !displayName.trim()}
      >
        {loading ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
