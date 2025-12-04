"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Image from "next/image";
import { CaretDown } from "@phosphor-icons/react";
import { supabaseBrowserClient } from "@/lib/supabase/client";

type Member = {
  user_id: string;
  name: string;
  role: string;
  avatar_url: string | null;
};

const ROLE_OPTIONS = ["admin", "member"];

export default function HiveMembersClient({
  hiveId,
  initialMembers,
}: {
  hiveId: string;
  initialMembers: Member[];
}) {
  const supabase = supabaseBrowserClient;
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});

  const adminCount = useMemo(
    () => members.filter((m) => m.role === "admin").length,
    [members]
  );

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        a.role === "admin" && b.role !== "admin" ? -1 : 0
      ),
    [members]
  );

  useEffect(() => {
    console.log("[members-client] initialMembers", initialMembers);
    console.log("[members-client] state members", members);
  }, [initialMembers, members]);

  useEffect(() => {
    if (!supabase) return;
    const toSign = new Set<string>();
    members.forEach((m) => {
      if (m.avatar_url && !m.avatar_url.startsWith("http") && !signed[m.avatar_url]) {
        toSign.add(m.avatar_url);
      }
    });
    if (toSign.size === 0) return;
    toSign.forEach((path) => {
      supabase.storage
        .from("user-avatars")
        .createSignedUrl(path, 300)
        .then(({ data }) => {
          if (data?.signedUrl) {
            setSigned((prev) => ({ ...prev, [path]: data.signedUrl }));
          }
        });
    });
  }, [members, signed, supabase]);

  const removeMember = async (userId: string, role: string) => {
    if (!supabase) return;
    if (role === "admin" && adminCount <= 1) {
      setError("Cannot remove the only admin.");
      return;
    }
    const { error } = await supabase
      .from("hive_members")
      .delete()
      .eq("hive_id", hiveId)
      .eq("user_id", userId);
    if (error) {
      setError(error.message);
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    setMenuOpenFor(null);
  };

  const changeRole = async (userId: string, nextRole: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("hive_members")
      .update({ role: nextRole })
      .eq("hive_id", hiveId)
      .eq("user_id", userId);
    if (error) {
      setError(error.message);
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.user_id === userId ? { ...m, role: nextRole } : m))
    );
    setMenuOpenFor(null);
  };

  const renderAvatar = (m: Member) => {
    const initials = m.name.slice(0, 2).toUpperCase();
    const resolved =
      m.avatar_url && m.avatar_url.startsWith("http")
        ? m.avatar_url
        : m.avatar_url
        ? signed[m.avatar_url]
        : null;
    if (resolved) {
      return (
        <Image
          src={resolved}
          alt={m.name}
          width={36}
          height={36}
          className="rounded-full object-cover"
        />
      );
    }
    return (
      <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-sm font-semibold">
        {initials}
      </div>
    );
  };

  return (
    <div className="space-y-4" ref={menuRef}>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="divide-y divide-slate-200  rounded-xl">
        {sortedMembers.map((m) => {
          const isOnlyAdmin = m.role === "admin" && adminCount <= 1;
          return (
            <div
              key={m.user_id}
              className="flex items-center justify-between py-3 bg-white"
            >
              <div className="flex items-center gap-3">
                {renderAvatar(m)}
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {m.name}
                  </div>
                  <div className="text-xs text-slate-500 capitalize">
                    {m.role}
                  </div>
                </div>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setMenuOpenFor((prev) =>
                      prev === m.user_id ? null : m.user_id
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 bg-white hover:bg-slate-50"
                >
                  Actions
                  <CaretDown size={14} />
                </button>
                {menuOpenFor === m.user_id && (
                  <div className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                    <button
                      className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                      disabled={isOnlyAdmin}
                      onClick={() => removeMember(m.user_id, m.role)}
                    >
                      {isOnlyAdmin
                        ? "Cannot remove only admin"
                        : "Remove from hive"}
                    </button>
                    <div className="border-t border-slate-100 px-3 py-2">
                      <div className="text-xs text-slate-500 mb-1">
                        Change role
                      </div>
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.user_id, e.target.value)}
                        className="w-full border border-slate-200 rounded-md text-sm px-2 py-1 bg-white"
                        disabled={isOnlyAdmin && m.role !== "admin"}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
