"use client";

import { CaretUpDownIcon } from "@phosphor-icons/react";

export default function ButtonTemp() {
  return (
    <button
      type="button"
      className="w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 transition-colors"
      aria-label="Toggle options"
    >
      <CaretUpDownIcon size={16} className="text-slate-500" />
    </button>
  );
}
