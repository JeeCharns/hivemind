import Image from "next/image";
import React from "react";
import { validateImageFile } from "@/lib/utils/upload";

type ImageUploadTileProps = {
  label?: string;
  currentUrl?: string | null;
  previewUrl?: string | null;
  onFileSelected?: (file: File | null) => void;
  onSelectFile?: (file: File | null) => void;
  accept?: string;
  error?: string | null;
  setError?: (msg: string | null) => void;
  helperText?: string;
};

export default function ImageUploadTile({
  label = "Upload",
  currentUrl = null,
  previewUrl = null,
  onFileSelected,
  onSelectFile,
  accept = ".png,.jpeg,.jpg",
  error,
  setError,
  helperText,
}: ImageUploadTileProps) {
  const handleChange = (file: File | null) => {
    if (setError) setError(null);
    const cb = onFileSelected || onSelectFile;
    if (!cb) return;
    if (!file) {
      cb(null);
      return;
    }
    const validation = validateImageFile(file, { maxMb: 2 });
    if (validation) {
      if (setError) setError(validation);
      return;
    }
    cb(file);
  };

  const displayUrl = previewUrl ?? currentUrl;

  return (
    <label className="relative w-16 h-16 bg-[#D7E0F0] rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden group">
      {displayUrl ? (
        <>
          <Image
            src={displayUrl}
            alt={`${label} preview`}
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
          <span className="text-[12px] text-[#566888] leading-none">{label}</span>
        </>
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleChange(e.target.files?.[0] ?? null)}
      />
      {helperText && !error && (
        <span className="text-[11px] text-slate-500 absolute -bottom-5 left-0 right-0 text-center">
          {helperText}
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
