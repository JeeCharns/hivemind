/**
 * Storage Validation - Pure Functions
 *
 * Pure validation functions for file uploads
 * Follows SRP: single responsibility of validation
 * Unit-testable: no side effects, deterministic
 */

import type { ImageValidationOptions } from "@/types/hive-settings";

/**
 * Validate an image file meets size and type requirements
 *
 * @param file - File to validate
 * @param opts - Validation options (maxMb, allowedTypes)
 * @returns Error message or null if valid
 */
export function validateImageFile(
  file: File | null,
  opts: ImageValidationOptions = {}
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

/**
 * Check if a URL is already a full HTTP(S) URL
 *
 * @param url - URL string to check
 * @returns True if URL starts with http:// or https://
 */
export function isHttpUrl(url: string | null): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}
