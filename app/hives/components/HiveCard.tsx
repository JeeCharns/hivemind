/**
 * HiveCard Component
 *
 * Presentational component for displaying a single hive
 * Props-only, no business logic
 */

"use client";

import { useState, useEffect } from "react";
import { getLogoSignedUrl } from "@/lib/supabase/storage";
import HiveLogo from "@/app/components/hive-logo";

interface HiveCardProps {
  name: string;
  logoUrl: string | null;
  onClick: () => void;
}

export default function HiveCard({ name, logoUrl, onClick }: HiveCardProps) {
  const [logo, setLogo] = useState<{
    logoUrl: string;
    signedUrl: string | null;
  } | null>(null);
  const signedUrl =
    logoUrl && logo?.logoUrl === logoUrl ? logo.signedUrl : null;

  useEffect(() => {
    if (!logoUrl) return;

    let cancelled = false;

    getLogoSignedUrl(logoUrl).then((url) => {
      if (!cancelled) {
        setLogo({ logoUrl, signedUrl: url });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border border-slate-200 rounded-lg px-4 py-6 hover:border-indigo-200 transition flex items-center gap-2 text-left"
    >
      <HiveLogo src={signedUrl} name={name} size={48} />
      <div className="text-subtitle text-slate-800 truncate">{name}</div>
    </button>
  );
}
