"use client";

import { CaretUpDownIcon } from "@phosphor-icons/react";

export default function ButtonTemp() {
  return (
    <button className="w-10 h-10 rounded-lg border text-slate-300 flex items-center justify-center">
      <CaretUpDownIcon size={16} className="text-slate-800" />
    </button>
  );
}
