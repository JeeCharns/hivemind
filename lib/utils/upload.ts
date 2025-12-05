import type { SupabaseClient } from "@supabase/supabase-js";
import { getSignedUrl } from "./storage";

export function validateImageFile(
  file: File | null,
  opts: { maxMb?: number; allowedTypes?: string[] } = {}
): string | null {
  if (!file) return null;
  const maxMb = opts.maxMb ?? 2;
  const allowed = opts.allowedTypes ?? ["image/png", "image/jpeg"];
  const type = file.type.toLowerCase();
  if (!allowed.includes(type)) {
    return "File must be a .png or .jpeg image.";
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `File must be under ${maxMb}MB.`;
  }
  return null;
}

type UploadResult = { path: string; signedUrl: string | null };

export async function uploadImageAndReplace(
  supabase: SupabaseClient,
  bucket: string,
  file: File,
  pathPrefix: string,
  previousPath?: string | null,
  opts: { signExpires?: number; deleteOld?: boolean } = {}
): Promise<UploadResult> {
  const signExpires = opts.signExpires ?? 300;
  const deleteOld = opts.deleteOld ?? true;

  const ext = file.name.split(".").pop();
  const path = `${pathPrefix}/${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  if (previousPath && previousPath !== path && deleteOld) {
    await supabase.storage.from(bucket).remove([previousPath]).catch(() => {});
  }

  const signedUrl = await getSignedUrl(supabase, bucket, path, signExpires);
  return { path, signedUrl };
}
