import Image from "next/image";
import { CaretDown } from "@phosphor-icons/react";
import Button from "@/components/button";

type MemberRowProps = {
  name: string;
  role: string;
  avatarUrl: string | null;
  actionsOpen: boolean;
  onToggleActions: () => void;
  onChangeRole: (role: string) => void;
  onRemove: () => void;
  onCloseActions: () => void;
  isOnlyAdmin: boolean;
};

const ROLE_OPTIONS = ["admin", "member"];

export function MemberRow({
  name,
  role,
  avatarUrl,
  actionsOpen,
  onToggleActions,
  onChangeRole,
  onRemove,
  onCloseActions,
  isOnlyAdmin,
}: MemberRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100">
      <div className="flex items-center gap-3">
        <div className="relative h-9 w-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-sm font-semibold text-slate-700">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={name} fill sizes="36px" className="object-cover" />
          ) : (
            (name || "U")
              .split(" ")
              .filter(Boolean)
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-900">{name}</span>
          <span className="text-xs text-slate-500">{role}</span>
        </div>
      </div>
      <div className="relative">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1"
          onClick={onToggleActions}
        >
          Actions
          <CaretDown size={14} />
        </Button>
        {actionsOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
            <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100">
              {name}
            </div>
            <div className="flex flex-col">
              <div className="px-3 py-2 text-xs text-slate-500 uppercase tracking-wide">
                Change role
              </div>
              {ROLE_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start px-3 py-2 text-slate-800"
                  disabled={opt === role}
                  onClick={() => {
                    onChangeRole(opt);
                    onCloseActions();
                  }}
                >
                  {opt === role ? `Current: ${opt}` : `Set to ${opt}`}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start px-3 py-2 text-red-600"
                disabled={isOnlyAdmin}
                onClick={() => {
                  onRemove();
                  onCloseActions();
                }}
              >
                Remove from hive
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
