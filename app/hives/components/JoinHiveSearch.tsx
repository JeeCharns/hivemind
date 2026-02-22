"use client";

/**
 * JoinHiveSearch - Client Component
 *
 * Search for hives by name and join them
 * Follows SRP: UI only, calls API routes for data
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Button from "@/app/components/button";

interface HiveSearchResult {
  id: string;
  name: string | null;
  slug: string | null;
  alreadyMember: boolean;
}

interface JoinHiveSearchProps {
  initialError?: string | null;
  showMembershipStatus?: boolean;
  disableAlreadyMember?: boolean;
}

export default function JoinHiveSearch({
  initialError,
  showMembershipStatus = true,
  disableAlreadyMember = true,
}: JoinHiveSearchProps) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<HiveSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced search with AbortController
  useEffect(() => {
    const trimmed = term.trim();

    // Clear results if term is empty
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    setLoading(true);

    // Debounce: wait 200ms before firing request
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/hives/search?term=${encodeURIComponent(trimmed)}&limit=5`,
          { signal }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error ?? "Search failed");
        }

        const data = await response.json();
        setResults(data.results ?? []);
        setError(null);
      } catch (err) {
        // Ignore abort errors (they're expected when cancelling)
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("[JoinHiveSearch] Search error:", err);
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [term]);

  const handleJoin = useCallback(
    async (hive: HiveSearchResult) => {
      setError(null);

      try {
        const response = await fetch(`/api/hives/${hive.id}/join`, {
          method: "POST",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error ?? "Failed to join hive");
        }

        const data = await response.json();

        // Navigate to hive page
        router.push(`/hives/${data.hiveKey}`);
      } catch (err) {
        console.error("[JoinHiveSearch] Join error:", err);
        setError(err instanceof Error ? err.message : "Failed to join hive");
      }
    },
    [router]
  );

  const showNoResult =
    term.trim().length > 0 && results.length === 0 && !loading;

  return (
    <div className="w-full space-y-4">
      {/* "or" separator */}
      <div className="text-sm text-[#9EA3B8] text-center">or</div>

      {/* Search input */}
      <div className="w-full relative">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by organisation name"
          className="w-full h-10 border border-[#E2E8F0] rounded-md px-3 pr-10 text-sm text-slate-700 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
        />
        <div className="absolute inset-y-0 right-3 flex items-center text-[#172847]">
          <MagnifyingGlass size={16} />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="w-full border border-slate-200 rounded-lg divide-y divide-slate-200">
          {results.map((result) => (
            <Button
              key={result.id}
              variant="ghost"
              className="w-full justify-start text-sm text-slate-800"
              onClick={() => handleJoin(result)}
              disabled={disableAlreadyMember && result.alreadyMember}
            >
              <span className="flex-1 text-left">{result.name}</span>
              {showMembershipStatus && result.alreadyMember && (
                <span className="text-xs text-slate-500 ml-2">
                  Already a member
                </span>
              )}
            </Button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showNoResult && (
        <div className="text-center text-sm text-[#566175] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full">
          We could not find an organisation by that name. Ask for an invite or
          start a new Hive!
        </div>
      )}
    </div>
  );
}
