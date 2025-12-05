"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import DeleteHiveButton from "@/components/delete-hive-button";
import { validateImageFile, uploadImageAndReplace } from "@/lib/utils/upload";
import { getSignedUrl } from "@/lib/utils/storage";
import Alert from "@/components/alert";
import Button from "@/components/button";

type Props = {
  hiveId: string;
  initialName: string;
  initialLogo: string | null;
};

export default function HiveSettingsClient({
  hiveId,
  initialName,
  initialLogo,
}: Props) {
  const supabase = supabaseBrowserClient;
  const [name, setName] = useState(initialName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedLogo, setSignedLogo] = useState<string | null>(null);
  const [logoPathState, setLogoPathState] = useState<string | null>(
    initialLogo
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!initialLogo || initialLogo.startsWith("http")) {
      setSignedLogo(initialLogo ?? null);
      return;
    }
    if (!supabase) return;
    getSignedUrl(supabase, "logos", initialLogo, 300).then((url) =>
      setSignedLogo(url)
    );
  }, [initialLogo, supabase]);

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
    if (!supabase || !logoFile || logoError) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) throw new Error("Please sign in.");
      const prevPath = logoPathState;
      const { path, signedUrl } = await uploadImageAndReplace(
        supabase,
        "logos",
        logoFile,
        userId,
        prevPath
      );
      const { error: updateErr } = await supabase
        .from("hives")
        .update({ logo_url: path })
        .eq("id", hiveId);
      if (updateErr) throw updateErr;
      setMessage("Logo updated.");
      setLogoFile(null);
      setLogoPathState(path);
      setSignedLogo(signedUrl ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update logo.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const saveName = async () => {
    if (!supabase || !name.trim()) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("hives")
        .update({ name: name.trim() })
        .eq("id", hiveId);
      if (updateErr) throw updateErr;
      setMessage("Name updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update name.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const currentLogo = useMemo(() => {
    if (previewUrl) return previewUrl;
    return signedLogo;
  }, [previewUrl, signedLogo]);

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

      <div className="pt-2">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Delete hive
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          This action cannot be undone. All sessions and data will be removed.
        </p>
        <DeleteHiveButton hiveId={hiveId} />
      </div>
    </div>
  );
}
