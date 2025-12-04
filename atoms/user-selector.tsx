"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./avatar";
import { supabaseBrowserClient } from "@/lib/supabase/client";

export default function UserSelector({
  displayName,
  avatarPath,
}: {
  displayName?: string;
  avatarPath?: string | null;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data?.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      active = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!avatarPath) {
      setTimeout(() => {
        setAvatarUrl((prev) => (prev ? null : prev));
      }, 0);
      return;
    }
    if (avatarPath.startsWith("http")) {
      setTimeout(() => {
        setAvatarUrl(avatarPath);
      }, 0);
      return;
    }
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    supabase.storage
      .from("user-avatars")
      .createSignedUrl(avatarPath, 300)
      .then(({ data }) => {
        if (data?.signedUrl) {
          setTimeout(() => setAvatarUrl(data.signedUrl), 0);
        }
      });
  }, [avatarPath]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      window.addEventListener("click", onClickAway);
    }
    return () => window.removeEventListener("click", onClickAway);
  }, [menuOpen]);

  const name = displayName || email || "User";
  const initials =
    name
      ?.split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "U";

  const logout = async () => {
    if (!supabaseBrowserClient) return;
    setError(null);
    const { error: signOutError } = await supabaseBrowserClient.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="flex items-center gap-3"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <div className="text-lg font-medium text-slate-800">{name}</div>
        <Avatar initials={initials} size="sm" src={avatarUrl ?? undefined} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-50">
          {email && (
            <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100">
              {email}
            </div>
          )}
          <button
            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              router.push("/account");
              setMenuOpen(false);
            }}
          >
            Account settings
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={logout}
          >
            Log out
          </button>
          {error && (
            <div className="px-3 py-2 text-xs text-red-600 border-t border-slate-100">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
