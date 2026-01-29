/**
 * Members View - Presentational Component
 *
 * Displays list of hive members with management actions
 * Follows SRP: only responsible for UI rendering
 * All data and actions come from props
 */

"use client";

import { useState, useMemo, useTransition } from "react";
import type { MemberViewModel, HiveMemberRole } from "@/types/members";
import MemberRow from "./components/MemberRow";
import Alert from "@/app/components/alert";
import { changeMemberRoleAction, removeMemberAction } from "./actions";

interface MembersViewProps {
  hiveId: string;
  members: MemberViewModel[];
  isLoading: boolean;
  error: string | null;
  isAdmin?: boolean;
}

export default function MembersView({
  hiveId,
  members,
  isLoading,
  error,
  isAdmin = false,
}: MembersViewProps) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Calculate admin count for "only admin" detection
  const adminCount = useMemo(
    () => members.filter((m) => m.role === "admin").length,
    [members]
  );

  // Sort members: admins first
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (a.role !== "admin" && b.role === "admin") return 1;
        return a.displayName.localeCompare(b.displayName);
      }),
    [members]
  );

  const handleChangeRole = async (userId: string, role: HiveMemberRole) => {
    setPendingUserId(userId);
    setActionError(null);

    startTransition(async () => {
      try {
        const result = await changeMemberRoleAction(hiveId, userId, role);
        if (!result.success) {
          setActionError(result.error);
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to change role");
      } finally {
        setPendingUserId(null);
      }
    });
  };

  const handleRemove = async (userId: string) => {
    setPendingUserId(userId);
    setActionError(null);

    startTransition(async () => {
      try {
        const result = await removeMemberAction(hiveId, userId);
        if (!result.success) {
          setActionError(result.error);
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to remove member");
      } finally {
        setPendingUserId(null);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Members</h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-200 animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-slate-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Alert */}
      {error && <Alert variant="error">{error}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* Members List */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Members</h2>
          <p className="text-sm text-slate-500 mt-1">
            {members.length} {members.length === 1 ? "member" : "members"} •{" "}
            {adminCount} {adminCount === 1 ? "admin" : "admins"}
          </p>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No members found
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedMembers.map((member) => {
              const isOnlyAdmin = member.role === "admin" && adminCount <= 1;
              return (
                <MemberRow
                  key={member.userId}
                  userId={member.userId}
                  name={member.displayName}
                  role={member.role}
                  avatarUrl={member.avatarUrl}
                  isOnlyAdmin={isOnlyAdmin}
                  onChangeRole={handleChangeRole}
                  onRemove={handleRemove}
                  isPending={pendingUserId === member.userId}
                  showActions={isAdmin}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
