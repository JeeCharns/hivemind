"use client";

/**
 * SettingsForm Component
 *
 * Presentational form component for updating hive settings
 * Props-only, no business logic
 */

import { useState } from "react";
import Input from "@/app/components/input";
import Button from "@/app/components/button";

interface SettingsFormProps {
  initialName: string;
  initialLogoUrl?: string | null;
  onSubmit: (data: { name?: string; logo_url?: string }) => void;
  onDelete: () => void;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
}

export default function SettingsForm({
  initialName,
  initialLogoUrl,
  onSubmit,
  onDelete,
  isUpdating,
  isDeleting,
  error,
}: SettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: { name?: string; logo_url?: string } = {};

    if (name.trim() !== initialName) {
      updates.name = name.trim();
    }

    if (logoUrl.trim() !== (initialLogoUrl || "")) {
      updates.logo_url = logoUrl.trim();
    }

    if (Object.keys(updates).length > 0) {
      onSubmit(updates);
    }
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this hive? This action cannot be undone.")) {
      onDelete();
    }
  };

  const hasChanges = name.trim() !== initialName || logoUrl.trim() !== (initialLogoUrl || "");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <Input
          label="Hive Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter hive name"
          disabled={isUpdating || isDeleting}
          required
        />

        <Input
          label="Logo URL (optional)"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          disabled={isUpdating || isDeleting}
          type="url"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 px-2">{error}</div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={!hasChanges || isUpdating || isDeleting}
        >
          {isUpdating ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-sm font-semibold text-[#172847] mb-2">Danger Zone</h3>
        <p className="text-sm text-[#566175] mb-4">
          Once you delete a hive, there is no going back. Please be certain.
        </p>
        <Button
          type="button"
          variant="danger"
          onClick={handleDelete}
          disabled={isUpdating || isDeleting}
        >
          {isDeleting ? "Deleting..." : "Delete Hive"}
        </Button>
      </div>
    </form>
  );
}
