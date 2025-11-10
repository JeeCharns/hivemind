import Avatar from "./avatar";
import ButtonTemp from "./button-temp";

export default function OrgSelector() {
  return (
    <div className="flex justify-between p-6 items-center">
      <div className="flex space-x-4">
        <Avatar />
        <div className="flex-row">
          <div className="text-lg">Sol Ltd</div>
          <div> Organisation </div>
        </div>
      </div>

      <ButtonTemp />
    </div>
  );
}
