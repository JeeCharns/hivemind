"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/button";
import Alert from "@/components/alert";
import Card from "@/components/card";
import ImageUploadTile from "@/components/image-upload-tile";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { validateImageFile, uploadImageAndReplace } from "@/lib/utils/upload";
import type { Session } from "@supabase/supabase-js";

export default function ProfileSetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (!data.session) {
          router.replace("/");
        }
      });
  }, [router]);

  const onFileChange = (next: File | null) => {
    setError(null);
    setFile(next);
    if (next) {
      setPreview(URL.createObjectURL(next));
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = supabaseBrowserClient;
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session?.user) {
      setError(sessionErr?.message ?? "No active session.");
      return;
    }
    const user = sessionData.session.user;

    const fileError = validateImageFile(file, { maxMb: 2 });
    if (fileError) {
      setError(fileError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let avatarPath: string | null = null;
      if (file) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("avatar_path")
          .eq("id", user.id)
          .maybeSingle();

        const { path } = await uploadImageAndReplace(
          supabase,
          "user-avatars",
          file,
          user.id,
          existing?.avatar_path ?? null
        );
        avatarPath = path;
      }

      const { error: upsertErr } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          display_name: name.trim(),
          avatar_path: avatarPath ?? undefined,
        },
        { onConflict: "id" }
      );

      if (upsertErr) throw upsertErr;

      const { data: memberships, error: mErr } = await supabase
        .from("hive_members")
        .select("hive_id")
        .eq("user_id", user.id);
      if (mErr) throw mErr;

      if (!memberships || memberships.length === 0) {
        router.replace("/welcome");
      } else if (memberships.length === 1) {
        router.replace(`/hives/${memberships[0].hive_id}`);
      } else {
        router.replace("/hives");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save profile.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F0F5] flex items-center justify-center px-4">
      <Card className="w-[473px] max-w-full flex flex-col items-center gap-4 p-8">
        <div className="text-center space-y-2 w-full">
          <h1 className="text-2xl font-semibold text-[#172847]">Set up your profile</h1>
          <p className="text-sm text-[#566175] leading-relaxed">
            Add your name and an optional avatar so your team can recognise you.
          </p>
        </div>

        {error && <Alert variant="error" className="w-full">{error}</Alert>}

        <form className="w-full space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-800">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 border border-[#E2E8F0] rounded-md px-3 text-sm text-slate-800 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
              placeholder="Your name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-800">Avatar (optional)</label>
            <ImageUploadTile
              previewUrl={preview ?? undefined}
              onSelectFile={(f) => onFileChange(f ?? null)}
              accept="image/png,image/jpeg"
              helperText="PNG or JPEG, up to 2MB"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
