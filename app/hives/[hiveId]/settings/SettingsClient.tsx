/**
 * Hive Settings Client Component
 *
 * Pure UI component for hive settings management
 * Follows SRP: only responsible for rendering UI and handling form state
 * All mutations delegated to server actions
 */

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { validateImageFile } from "@/lib/storage/validation";
import { updateHiveNameAction, updateHiveLogoAction, updateHiveVisibilityAction, deleteHiveAction } from "./actions";
import type { HiveVisibility } from "@/types/hives-api";
import Alert from "@/app/components/alert";
import Button from "@/app/components/button";

interface SettingsClientProps {
  hiveId: string;
  initialName: string;
  initialLogoUrl: string | null;
  initialVisibility: HiveVisibility;
}

export default function SettingsClient({
  hiveId,
  initialName,
  initialLogoUrl,
  initialVisibility,
}: SettingsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Form state
  const [name, setName] = useState(initialName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<HiveVisibility>(initialVisibility);

  // UI feedback state
  const [logoError, setLogoError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleLogoChange = (file: File | null) => {
    setLogoError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setLogoFile(file);

    if (file) {
      const validation = validateImageFile(file, { maxMb: 2 });
      if (validation) {
        setLogoError(validation);
        setPreviewUrl(null);
        return;
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const saveLogo = async () => {
    if (!logoFile || logoError) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("logo", logoFile);

        const result = await updateHiveLogoAction(hiveId, formData);

        if (!result.success) {
          setError(result.error);
        } else {
          setMessage(result.message || "Logo updated.");
          setLogoFile(null);
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update logo.");
      } finally {
        setLoading(false);
      }
    });
  };

  const saveName = async () => {
    if (!name.trim()) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("name", name.trim());

        const result = await updateHiveNameAction(hiveId, formData);

        if (!result.success) {
          setError(result.error);
        } else {
          setMessage(result.message || "Name updated.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update name.");
      } finally {
        setLoading(false);
      }
    });
  };

  const saveVisibility = async (newVisibility: HiveVisibility) => {
    if (newVisibility === initialVisibility) return;

    setLoading(true);
    setMessage(null);
    setError(null);
    setVisibility(newVisibility);

    startTransition(async () => {
      try {
        const result = await updateHiveVisibilityAction(hiveId, newVisibility);

        if (!result.success) {
          setError(result.error);
          setVisibility(initialVisibility); // Revert on error
        } else {
          setMessage(result.message || "Visibility updated.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update visibility.");
        setVisibility(initialVisibility); // Revert on error
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDelete = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const result = await deleteHiveAction(hiveId);

        if (!result.success) {
          setError(result.error);
          setLoading(false);
        } else {
          // Redirect based on server response
          const redirectTo = result.redirectTo || "/hives";
          router.replace(redirectTo);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete hive");
        setLoading(false);
      }
    });
  };

  const currentLogo = useMemo(() => {
    if (previewUrl) return previewUrl;
    return initialLogoUrl;
  }, [previewUrl, initialLogoUrl]);

  return (
    <div className="flex flex-col gap-6">
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Change hive logo
        </h2>
        <div className="flex items-center gap-4">
          <label className="relative w-16 h-16 bg-[#D7E0F0] rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden group">
            {currentLogo ? (
              <>
                <Image
                  src={currentLogo}
                  alt="Logo preview"
                  fill
                  sizes="64px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-medium">
                  Change
                </div>
              </>
            ) : (
              <>
                <span className="text-[#566888] text-lg leading-none">+</span>
                <span className="text-[12px] text-[#566888] leading-none">
                  Logo
                </span>
              </>
            )}
            <input
              type="file"
              accept=".png,.jpeg,.jpg"
              className="hidden"
              onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            type="button"
            disabled={!logoFile || !!logoError || loading}
            onClick={saveLogo}
          >
            {loading && logoFile ? "Saving..." : "Upload new logo"}
          </Button>
        </div>
        {logoError && <div className="text-xs text-red-600">{logoError}</div>}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          Change hive name
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 h-10 border border-[#E2E8F0] rounded-md px-3 text-sm text-slate-800 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none max-w-xl"
            placeholder="Enter hive name"
          />
          <Button
            type="button"
            disabled={!name.trim() || loading}
            onClick={saveName}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Hive Visibility
        </h2>
        <p className="text-sm text-slate-600">
          Control who can discover and join this hive.
        </p>
        <div className="flex flex-col gap-3 max-w-xl">
          <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${visibility === "public" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === "public"}
              onChange={() => saveVisibility("public")}
              disabled={loading}
              className="w-4 h-4 mt-0.5"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[#172847]">
                Public
              </span>
              <span className="text-xs text-slate-500">
                Anyone can search for and join this hive.
              </span>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${visibility === "private" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => saveVisibility("private")}
              disabled={loading}
              className="w-4 h-4 mt-0.5"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[#172847]">
                Private
              </span>
              <span className="text-xs text-slate-500">
                Only people with an invite link can join. This hive won&apos;t appear in search.
              </span>
            </div>
          </label>
        </div>
      </div>

      <div className="pt-2">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Delete hive
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          This action cannot be undone. All sessions and data will be removed.
        </p>

        {!showDeleteConfirm ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
          >
            Delete Hive
          </Button>
        ) : (
          <div className="space-y-2">
            <Alert variant="error">
              Are you sure you want to delete this hive? All data will be removed.
            </Alert>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? "Deleting…" : "Yes, Delete Hive"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
