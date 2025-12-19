/**
 * createHive - Server Service
 *
 * Creates a hive, adds the creator as an admin, and optionally uploads a logo.
 * Keeps responsibilities small and dependencies injected (Supabase client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const HIVE_LOGO_BUCKET = "logos";

export type CreateHiveLogoFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

export type CreateHiveInput = {
  name: string;
  logoFile?: CreateHiveLogoFile | null;
  logoUrl?: string | null;
};

function slugify(input: string): string {
  const base =
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "hive";
  return base;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "23505") return true;
  const message =
    "message" in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.toLowerCase().includes("duplicate");
}

async function insertHiveWithUniqueSlug(
  supabase: SupabaseClient,
  input: { name: string; logo_url: string | null }
) {
  const slugBase = slugify(input.name);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt + 1}`;

    const { data, error } = await supabase
      .from("hives")
      .insert({ name: input.name, slug, logo_url: input.logo_url })
      .select()
      .single();

    if (!error && data) return data;

    if (isUniqueViolation(error)) {
      continue;
    }

    throw new Error(
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Failed to create hive"
    );
  }

  throw new Error("Failed to create hive: could not generate a unique slug");
}

async function uploadHiveLogo(
  supabase: SupabaseClient,
  hiveId: string,
  file: CreateHiveLogoFile
): Promise<string> {
  const extension = file.fileName.split(".").pop() || "png";
  const storagePath = `${hiveId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(HIVE_LOGO_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload logo: ${uploadError.message}`);
  }

  return storagePath;
}

async function deleteHiveBestEffort(supabase: SupabaseClient, hiveId: string) {
  try {
    await supabase.from("hives").delete().eq("id", hiveId);
  } catch {
    // best-effort cleanup
  }
}

async function deleteLogoBestEffort(supabase: SupabaseClient, logoPath: string) {
  try {
    await supabase.storage.from(HIVE_LOGO_BUCKET).remove([logoPath]);
  } catch {
    // best-effort cleanup
  }
}

export async function createHive(
  supabase: SupabaseClient,
  userId: string,
  input: CreateHiveInput
) {
  const name = input.name.trim();
  const initialLogoUrl = input.logoFile ? null : input.logoUrl ?? null;

  const hive = await insertHiveWithUniqueSlug(supabase, {
    name,
    logo_url: initialLogoUrl,
  });

  const { error: memberError } = await supabase
    .from("hive_members")
    .insert({ hive_id: hive.id, user_id: userId, role: "admin" });

  if (memberError) {
    await deleteHiveBestEffort(supabase, hive.id);
    throw new Error("Failed to create hive");
  }

  if (!input.logoFile) {
    return hive;
  }

  let logoPath: string | null = null;

  try {
    logoPath = await uploadHiveLogo(supabase, hive.id, input.logoFile);

    const { data: updatedHive, error: updateError } = await supabase
      .from("hives")
      .update({ logo_url: logoPath })
      .eq("id", hive.id)
      .select()
      .single();

    if (updateError || !updatedHive) {
      throw new Error(updateError?.message ?? "Failed to save hive logo");
    }

    return updatedHive;
  } catch (err) {
    if (logoPath) {
      await deleteLogoBestEffort(supabase, logoPath);
    }
    await deleteHiveBestEffort(supabase, hive.id);
    throw err;
  }
}
