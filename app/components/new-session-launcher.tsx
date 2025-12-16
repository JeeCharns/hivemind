"use client";

import { useState } from "react";
import NewSessionWizard from "./new-session-wizard";
import { PlusIcon } from "@phosphor-icons/react";
import Button from "@/app/components/button";

export default function NewSessionLauncher({
  asCard = false,
  hiveId,
  hiveSlug,
}: {
  asCard?: boolean;
  hiveId: string;
  hiveSlug?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (asCard) {
    return (
      <>
        <Button
          variant="secondary"
          className="w-full flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#D7E0F0] p-10 min-h-[300px] bg-white/60 text-[#566888] hover:border-[#b8c7e6] hover:text-[#3A1DC8] transition-colors"
          onClick={() => setOpen(true)}
        >
          <span className="w-14 h-14 rounded-lg bg-[#DADDE1] flex items-center justify-center">
            <PlusIcon size={24} className="text-[#566888]" />
          </span>
          <span className="text-sm font-medium">Create New Session</span>
        </Button>
        <NewSessionWizard
          open={open}
          onClose={() => setOpen(false)}
          hiveId={hiveId}
          hiveSlug={hiveSlug}
        />
      </>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-10 w-[117px]">
        New Session
      </Button>
      <NewSessionWizard
        open={open}
        onClose={() => setOpen(false)}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
      />
    </>
  );
}
