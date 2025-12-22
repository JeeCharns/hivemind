type AlertProps = {
  variant?: "success" | "error" | "info";
  children: React.ReactNode;
  className?: string;
};

const variantStyles: Record<NonNullable<AlertProps["variant"]>, string> = {
  success: "bg-green-50 border-green-100 text-green-700",
  error: "bg-red-50 border-red-100 text-red-700",
  info: "bg-slate-50 border-slate-200 text-slate-700",
};

export default function Alert({
  variant = "info",
  children,
  className = "",
}: AlertProps) {
  return (
    <div
      className={`text-body rounded-lg border px-3 py-2 ${variantStyles[variant]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
