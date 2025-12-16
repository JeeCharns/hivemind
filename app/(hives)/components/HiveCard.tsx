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
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!logoUrl) {
      setSignedUrl(null);
      return;
    }

    let cancelled = false;

    getLogoSignedUrl(logoUrl).then((url) => {
      if (!cancelled) {
        setSignedUrl(url);
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
      <div className="text-sm font-medium text-slate-800 truncate">{name}</div>
    </button>
  );
}
