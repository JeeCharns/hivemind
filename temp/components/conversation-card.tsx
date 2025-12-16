import Link from "next/link";
import { ConversationCardRow, getConversationCta } from "@/lib/utils/hive-cards";
import DateBadge from "./date-badge";

type HiveKey = { id: string; slug?: string | null };

type Props = {
  hive: HiveKey;
  conversation: ConversationCardRow;
};

export default function ConversationCard({ hive, conversation }: Props) {
  const cta = getConversationCta(hive, conversation);
  return (
    <article className="flex flex-col justify-between bg-white rounded-2xl border border-[#E6E9F2] p-6 min-h-[260px] shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <span className="inline-flex items-center gap-2 px-2 py-1 bg-[#FFF1EB] text-[#E46E00] text-[12px] leading-6 font-semibold rounded">
            {conversation.type === "decide" ? "SOLUTION SPACE" : "PROBLEM SPACE"}
          </span>
          <DateBadge value={conversation.created_at ?? undefined} />
        </div>
        <h3 className="text-xl font-medium text-[#172847]">
          {conversation.title}
        </h3>
        {conversation.description ? (
          <p className="text-sm leading-[1.4] font-normal text-[#566888]">
            {conversation.description}
          </p>
        ) : null}
      </div>

      <Link
        href={cta.href}
        className="mt-6 bg-[#EDEFFD] hover:bg-[#dfe3ff] text-[#3A1DC8] text-sm font-medium leading-6 rounded-sm py-2 px-4 text-center transition-colors"
      >
        {cta.label} →
      </Link>
    </article>
  );
}
