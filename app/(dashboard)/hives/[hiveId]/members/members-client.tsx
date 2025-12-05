"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import Alert from "@/components/alert";
import { MemberRow } from "./member-row";

type Member = {
  user_id: string;
  name: string;
  role: string;
  avatar_url: string | null;
};

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

  return (
    <div className="space-y-4" ref={menuRef}>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="divide-y divide-slate-200  rounded-xl">
        {sortedMembers.map((m) => {
          const isOnlyAdmin = m.role === "admin" && adminCount <= 1;
          return (
            <div key={m.user_id} ref={menuRef}>
              <MemberRow
                name={m.name}
                role={m.role}
                avatarUrl={
                  m.avatar_url?.startsWith("http")
                    ? m.avatar_url
                    : m.avatar_url
                    ? signed[m.avatar_url] ?? null
                    : null
                }
                actionsOpen={menuOpenFor === m.user_id}
                onToggleActions={() =>
                  setMenuOpenFor((prev) => (prev === m.user_id ? null : m.user_id))
                }
                onCloseActions={() => setMenuOpenFor(null)}
                onChangeRole={(role) => changeRole(m.user_id, role)}
                onRemove={() => removeMember(m.user_id, m.role)}
                isOnlyAdmin={isOnlyAdmin}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
