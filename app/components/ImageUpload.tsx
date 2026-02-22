/**
 * ImageUpload - Reusable Component
 *
 * Allows users to select, preview, and remove image files
 * Follows SRP: UI only, file selection (no direct upload)
 */

"use client";

import { useRef, useState, useEffect } from "react";
import { Image as ImageIcon, X } from "@phosphor-icons/react";

interface ImageUploadProps {
  label: string;
  value?: File | null;
  initialUrl?: string | null;
  onChange: (file: File | null) => void;
  accept?: string;
  maxSizeMB?: number;
  error?: string | null;
}

export default function ImageUpload({
  label,
  value,
  initialUrl,
  onChange,
  accept = "image/*",
  maxSizeMB = 2,
  error,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialUrl ?? null
  );

  // Update preview when value changes
  useEffect(() => {
    if (value) {
      const objectUrl = URL.createObjectURL(value);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else if (!value && !initialUrl) {
      setPreviewUrl(null);
    }
  }, [value, initialUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    onChange(file);
  };

  const handleRemove = () => {
    onChange(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        {label}
      </label>

      {/* Preview or Upload Button */}
      {previewUrl ? (
        <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition"
            aria-label="Remove image"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleButtonClick}
          className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-indigo-400 hover:bg-indigo-50 transition text-slate-500 hover:text-indigo-600"
        >
          <ImageIcon size={32} />
          <span className="text-xs text-center px-2">Click to upload</span>
        </button>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        aria-label={label}
      />

      {/* Helper Text */}
      <p className="text-xs text-slate-500">
        {accept.includes("image") &&
          `Max size: ${maxSizeMB}MB. Formats: JPEG, PNG, WebP, GIF`}
      </p>

      {/* Error Message */}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
