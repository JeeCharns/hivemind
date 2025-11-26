import Avatar from "./avatar";
import ButtonTemp from "./button-temp";

export default function OrgSelector({ hiveName }: { hiveName?: string }) {
  return (
    <div className="flex justify-between p-6 space-x-4 items-center">
      <div className="flex space-x-4">
        <Avatar />
        <div className="flex-row">
          <div className="text-lg truncate max-w-[180px]">
            {hiveName ?? "Hive"}
          </div>
          <div className="text-sm"> Organisation </div>
        </div>
      </div>

      <ButtonTemp />
    </div>
  );
}
