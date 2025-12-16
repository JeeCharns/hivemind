type CardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: string;
  shadow?: boolean;
};

export default function Card({
  children,
  className = "",
  padding = "p-6",
  shadow = true,
}: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl ${padding} ${shadow ? "shadow-sm" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
