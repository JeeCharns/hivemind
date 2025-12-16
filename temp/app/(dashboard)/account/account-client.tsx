"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { validateImageFile, uploadImageAndReplace } from "@/lib/utils/upload";
import { getSignedUrl } from "@/lib/utils/storage";
import Alert from "@/components/alert";
import ImageUploadTile from "@/components/image-upload-tile";
import Button from "@/components/button";

type Props = {
  userId: string;
  initialAvatarPath: string | null;
};

export default function AccountClient({ userId, initialAvatarPath }: Props) {
  const supabase = supabaseBrowserClient;
  const router = useRouter();
  const [avatarPath, setAvatarPath] = useState(initialAvatarPath);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!avatarPath || avatarPath.startsWith("http")) {
      setSignedUrl(avatarPath ?? null);
      return;
    }
    if (!supabase) return;
    getSignedUrl(supabase, "user-avatars", avatarPath, 300).then((url) =>
      setSignedUrl(url)
    );
  }, [avatarPath, supabase]);

  const currentAvatar = useMemo(() => {
    if (previewUrl) return previewUrl;
    return signedUrl;
  }, [previewUrl, signedUrl]);

  const handleFile = (f: File | null) => {
    setError(null);
    setMessage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    const validation = validateImageFile(f, { maxMb: 2 });
    if (validation) {
      setError(validation);
      return;
    }
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setFile(f);
  };

  const uploadAvatar = async () => {
    if (!supabase || !file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const prevPath = avatarPath;
    try {
      const { path, signedUrl } = await uploadImageAndReplace(
        supabase,
        "user-avatars",
        file,
        userId,
        prevPath
      );
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", userId);
      if (updateErr) throw updateErr;
      setAvatarPath(path);
      setSignedUrl(signedUrl);
      setFile(null);
      setMessage("Avatar updated.");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update avatar.";
        setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const removeAvatar = async () => {
    if (!supabase) return;
    if (!avatarPath) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", userId);
      if (updateErr) throw updateErr;
      await supabase.storage.from("user-avatars").remove([avatarPath]);
      setAvatarPath(null);
      setPreviewUrl(null);
      setFile(null);
      setSignedUrl(null);
      setMessage("Avatar removed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove avatar.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Avatar</h2>
        <div className="flex items-center gap-4">
          <ImageUploadTile
            label="Avatar"
            currentUrl={currentAvatar}
            onFileSelected={handleFile}
            error={error}
            setError={setError}
            accept=".png,.jpeg,.jpg"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={!file || loading}
              onClick={uploadAvatar}
            >
              {loading && file ? "Saving..." : "Upload new avatar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loading || (!avatarPath && !previewUrl)}
              onClick={removeAvatar}
            >
              Remove
            </Button>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          PNG or JPEG, max 2MB. Upload replaces your previous avatar.
        </div>
      </div>
    </div>
  );
}
