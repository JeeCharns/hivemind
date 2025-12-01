import Avatar from "./avatar";
import ButtonTemp from "./button-temp";

export default function OrgSelector({ hiveName }: { hiveName?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
        <Avatar variant="org" size="sm" />
        <div className="text-sm font-medium text-slate-800 truncate max-w-60">
          {hiveName ?? "Brightloop Mobility Co-Op"}
        </div>
      </div>
      <ButtonTemp />
    </div>
  );
}
