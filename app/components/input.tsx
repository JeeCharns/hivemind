import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
};

export default function Input({
  label,
  helperText,
  className = "",
  ...props
}: InputProps) {
  return (
    <label className="w-full flex flex-col gap-1">
      {label ? (
        <span className="text-label text-secondary font-display">{label}</span>
      ) : null}
      <input
        className={`w-full h-10 px-4 rounded-md border border-slate-200 text-text-primary text-body placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary ${className}`.trim()}
        {...props}
      />
      {helperText ? (
        <span className="text-info text-slate-500 font-display">
          {helperText}
        </span>
      ) : null}
    </label>
  );
}
