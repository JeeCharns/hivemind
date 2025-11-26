import Avatar from "./avatar";
import ButtonTemp from "./button-temp";

export default function OrgSelector() {
  return (
    <div className="flex justify-between p-6 items-center">
      <div className="flex space-x-4">
        <Avatar />
        <div className="flex-row">
          <div className="text-lg truncate max-w-[180px]">
            BrightLoop Mobility Co-Op
          </div>
          <div className="text-sm"> Organisation </div>
        </div>
      </div>

      <ButtonTemp />
    </div>
  );
}
