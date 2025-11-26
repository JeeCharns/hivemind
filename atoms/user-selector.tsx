import Avatar from "./avatar";
import ButtonTemp from "./button-temp";

export default function UserSelector({
  displayName,
}: {
  displayName?: string;
}) {
  return (
    <div className="flex justify-between p-6 items-center">
      <div className="flex space-x-4 items-center">
        <Avatar />
        <div className="text-lg">{displayName ?? "User"}</div>
      </div>

      <ButtonTemp />
    </div>
  );
}
