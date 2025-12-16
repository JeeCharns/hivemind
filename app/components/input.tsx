import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
};

export default function Input({ label, helperText, className = "", ...props }: InputProps) {
  return (
    <label className="w-full flex flex-col gap-1">
      {label ? (
        <span className="text-xs font-semibold text-[#566175]" style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}>
          {label}
        </span>
      ) : null}
      <input
        className={`w-full h-10 px-4 rounded-md border border-[#E2E8F0] text-[#172847] text-sm placeholder:text-[#A0AEC0] focus:outline-none focus:ring-2 focus:ring-[#3A1DC8]/20 focus:border-[#3A1DC8] ${className}`.trim()}
        {...props}
      />
      {helperText ? (
        <span className="text-xs text-slate-500" style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}>
          {helperText}
        </span>
      ) : null}
    </label>
  );
}
