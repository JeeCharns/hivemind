"use client";

import { useState } from "react";
import NewSessionWizard from "./new-session-wizard";
import { PlusIcon } from "@phosphor-icons/react";

export default function NewSessionLauncher({ asCard = false }: { asCard?: boolean }) {
  const [open, setOpen] = useState(false);

  if (asCard) {
    return (
      <>
        <button
          className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#D7E0F0] p-10 min-h-[300px] bg-white/60 text-[#566888] hover:border-[#b8c7e6] hover:text-[#3A1DC8] transition-colors"
          onClick={() => setOpen(true)}
        >
          <span className="w-14 h-14 rounded-lg bg-[#DADDE1] flex items-center justify-center">
            <PlusIcon size={24} className="text-[#566888]" />
          </span>
          <span className="text-sm font-medium">Create New Session</span>
        </button>
        <NewSessionWizard open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        className="bg-[#3A1DC8] hover:bg-[#2f18a6] text-white font-medium text-sm leading-6 px-4 py-2 rounded-md h-10 w-[117px]"
        onClick={() => setOpen(true)}
      >
        New Session
      </button>
      <NewSessionWizard open={open} onClose={() => setOpen(false)} />
    </>
  );
}
