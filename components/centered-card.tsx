type CenteredCardProps = {
  children: React.ReactNode;
  className?: string;
  widthClass?: string;
};

export default function CenteredCard({
  children,
  className = "",
  widthClass = "max-w-[480px]",
}: CenteredCardProps) {
  return (
    <div
      className={`w-full ${widthClass} bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col gap-4 p-8 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
