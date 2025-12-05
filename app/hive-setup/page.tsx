"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import Image from "next/image";
import { PencilSimple, Copy, CheckCircle } from "@phosphor-icons/react";
import Alert from "@/components/alert";
import Button from "@/components/button";

export default function HiveSetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [createdHiveId, setCreatedHiveId] = useState<string | null>(null);
  const [emails, setEmails] = useState<string[]>([""]);
  const [toast, setToast] = useState<string | null>(null);

  const nameValid = name.trim().length > 0;

  const logoError = useMemo(() => {
    if (!logoFile) return null;
    const type = logoFile.type.toLowerCase();
    if (!["image/png", "image/jpeg"].includes(type)) {
      return "Logo must be a .png or .jpeg image.";
    }
    return null;
  }, [logoFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleLogoChange = (file: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setLogoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || logoError) return;
    if (!supabaseBrowserClient) {
      setError("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionErr } =
        await supabaseBrowserClient.auth.getSession();
      if (sessionErr || !sessionData.session?.user?.id) {
        throw new Error("You must be signed in to create a hive.");
      }

      let logoUrl: string | null = null;
      if (logoFile && !logoError) {
        const fileExt = logoFile.name.split(".").pop();
        const path = `${sessionData.session.user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadErr, data: uploadData } =
          await supabaseBrowserClient.storage
            .from("logos")
            .upload(path, logoFile, { upsert: true });
        if (uploadErr) {
          throw uploadErr;
        }
        // Store the storage path so we can regenerate a public URL later (avoids expiring signed links)
        logoUrl = uploadData.path;
      }

      const res = await fetch("/api/hives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          logo_url: logoUrl,
          user_id: sessionData.session.user.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create hive");
      }
      const body = await res.json();
      setCreatedHiveId(body.id);
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create hive";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!createdHiveId) return;
    const url = `${window.location.origin}/hives/${createdHiveId}/invite`;
    try {
      await navigator.clipboard.writeText(url);
      setError(null);
      setToast("Link copied to clipboard");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setError("Failed to copy invite link");
    }
  };

  const validateEmails = (list: string[]) =>
    list
      .filter((e) => e.trim().length > 0)
      .every((e) => /\S+@\S+\.\S+/.test(e));

  const sendInvites = async () => {
    if (!createdHiveId) return;
    const filtered = emails.filter((e) => e.trim().length > 0);
    if (!validateEmails(filtered)) {
      setError("Please enter valid email addresses.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await fetch(`/api/hives/${createdHiveId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: filtered }),
      });
      router.replace(`/hives/${createdHiveId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send invites";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F0F0F5] flex items-center justify-center px-4"
      suppressHydrationWarning
    >
      <div className="w-full max-w-[473px] bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-8 flex flex-col items-center gap-4">
        <div className="w-full space-y-2">
          <p className="text-xs text-[#566175]">
            {step === 1 ? "Step 1 of 2" : "Step 2 of 2"}
          </p>
          <h1 className="text-xl font-semibold text-[#172847]">
            {step === 1 ? "Create a new Hive" : "Invite people to your hive"}
          </h1>
          <p className="text-sm text-[#566175]">
            {step === 1
              ? "Add your organisation name and logo to get started!"
              : "Copy an invite link or add emails to invite collaborators."}
          </p>
        </div>

      {error && <Alert variant="error">{error}</Alert>}

        {step === 1 ? (
          <form
            className="w-full space-y-4"
            onSubmit={onSubmit}
            suppressHydrationWarning
          >
            <div className="flex items-center gap-6 py-8">
              <label className="relative w-16 h-16 bg-[#D7E0F0] rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden group">
                {previewUrl ? (
                  <>
                    <Image
                      src={previewUrl}
                      alt="Logo preview"
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <PencilSimple size={18} className="text-white" />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-[#566888] text-lg leading-none">
                      +
                    </span>
                    <span className="text-[12px] text-[#566888] leading-none">
                      Logo
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept=".png,.jpeg,.jpg"
                  className="hidden"
                  onChange={(e) =>
                    handleLogoChange(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-xs font-semibold text-[#566175]">
                  Organisation Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 border border-[#E2E8F0] rounded-md px-3 text-sm text-slate-800 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
                  placeholder="Enter organisation name"
                />
              </div>
            </div>
            {logoError && (
              <div className="text-xs text-red-600">{logoError}</div>
            )}
            <Button
              type="submit"
              disabled={!nameValid || loading || !!logoError}
              className="w-full"
            >
              {loading ? "Creating..." : "Create Hive"}
            </Button>
          </form>
        ) : (
          <div className="w-full space-y-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
              onClick={handleCopyInvite}
            >
              <Copy size={16} />
              Copy invite link
            </Button>
            <div className="text-sm text-[#9EA3B8] text-center pb-4">or</div>
            <div className="space-y-2">
              <p className="text-sm text-[#566175]">Add email addresses</p>
              <div className="flex flex-col gap-2">
                {emails.map((val, idx) => (
                  <input
                    key={idx}
                    value={val}
                    onChange={(e) => {
                      const next = [...emails];
                      next[idx] = e.target.value;
                      setEmails(next);
                    }}
                    onFocus={() => {
                      if (idx === emails.length - 1) {
                        setEmails((prev) => [...prev, ""]);
                      }
                    }}
                    className="w-full h-10 border border-[#E2E8F0] rounded-md px-3 text-sm text-slate-800 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
                    placeholder="name@example.com"
                  />
                ))}
              </div>
              <Button
                type="button"
                disabled={loading}
                className="w-full"
                onClick={sendInvites}
              >
                {loading ? "Sending…" : "Invite"}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-[#566175]"
              onClick={() =>
                createdHiveId && router.replace(`/hives/${createdHiveId}`)
              }
            >
              Skip
            </Button>
          </div>
        )}
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 shadow-md flex items-center gap-2">
          <CheckCircle size={16} />
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </div>
  );
}
