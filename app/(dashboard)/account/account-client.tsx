"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
    supabase.storage
      .from("user-avatars")
      .createSignedUrl(avatarPath, 300)
      .then(({ data }) => setSignedUrl(data?.signedUrl ?? null));
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
    if (!["image/png", "image/jpeg"].includes(f.type.toLowerCase())) {
      setError("Avatar must be a .png or .jpeg image.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("Avatar must be under 2MB.");
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
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("user-avatars")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", userId);
      if (updateErr) throw updateErr;
      setAvatarPath(path);
      setFile(null);
      setMessage("Avatar updated.");
      if (prevPath && prevPath !== path) {
        await supabase.storage.from("user-avatars").remove([prevPath]);
      }
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
      {message && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          {message}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Avatar</h2>
        <div className="flex items-center gap-4">
          <label className="relative w-16 h-16 bg-[#D7E0F0] rounded-full flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden group">
            {currentAvatar ? (
              <>
                <Image
                  src={currentAvatar}
                  alt="Avatar preview"
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
                  Avatar
                </span>
              </>
            )}
            <input
              type="file"
              accept=".png,.jpeg,.jpg"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!file || loading}
              className="px-4 py-2 rounded-md bg-[#3A1DC8] text-white text-sm font-medium disabled:opacity-60"
              onClick={uploadAvatar}
            >
              {loading && file ? "Saving..." : "Upload new avatar"}
            </button>
            <button
              type="button"
              disabled={loading || (!avatarPath && !previewUrl)}
              className="px-4 py-2 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={removeAvatar}
            >
              Remove
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          PNG or JPEG, max 2MB. Upload replaces your previous avatar.
        </div>
      </div>
    </div>
  );
}
