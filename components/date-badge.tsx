import { formatHiveDate } from "@/lib/utils/hive-cards";

export default function DateBadge({ value }: { value?: string | null }) {
  return (
    <span className="text-sm font-medium text-[#566888]">
      {formatHiveDate(value ?? undefined)}
    </span>
  );
}
