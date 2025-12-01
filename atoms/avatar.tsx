type AvatarProps = {
  variant?: "user" | "org";
  size?: "sm" | "md";
  src?: string;
  initials?: string;
  alt?: string;
};

const sizeMap: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
};

export default function Avatar({
  variant = "user",
  size = "sm",
  src,
  initials,
  alt,
}: AvatarProps) {
  const dimension = sizeMap[size];

  if (variant === "org") {
    return (
      <div
        className={`${dimension} rounded-lg bg-slate-100 flex items-center justify-center`}
        aria-hidden="true"
      >
        <div className="w-3/4 h-3/4 rounded-full bg-[linear-gradient(165.65deg,_#000000_10.19%,_#5417A9_96.66%)]" />
      </div>
    );
  }

  const fallbackText = initials?.slice(0, 2).toUpperCase() || "U";
  const altText = alt ?? `${initials ?? "User"} avatar`;

  return (
    <div
      className={`${dimension} rounded-full overflow-hidden bg-slate-300 flex items-center justify-center text-sm font-medium text-white`}
      aria-label={altText}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={altText} className="w-full h-full object-cover" />
      ) : (
        <span>{fallbackText}</span>
      )}
    </div>
  );
}
