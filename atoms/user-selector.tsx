import Avatar from "./avatar";

export default function UserSelector({
  displayName,
}: {
  displayName?: string;
}) {
  const initials =
    displayName
      ?.split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "U";

  return (
    <div className="flex items-center gap-3">
      <div className="text-lg font-medium text-slate-800">
        {displayName ?? "User"}
      </div>
      <Avatar initials={initials} size="sm" />
    </div>
  );
}
