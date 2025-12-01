"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, ExportIcon } from "@phosphor-icons/react";

type ConversationHeaderProps = {
  hiveId: string;
  conversationId: string;
  title?: string;
  hiveName?: string;
};

export default function ConversationHeader({
  hiveId,
  conversationId,
  title = "Conversation",
}: ConversationHeaderProps) {
  const pathname = usePathname();

  const tabs = [
    { slug: "listen", label: "Listen" },
    { slug: "understand", label: "Understand" },
    { slug: "result", label: "Result" },
  ];

  const basePath = `/hives/${hiveId}/conversations/${conversationId}`;

  const activeFromPath = () => {
    const match = tabs.find((tab) => pathname?.includes(`/${tab.slug}`));
    return match?.slug ?? "listen";
  };

  const activeSlug = activeFromPath();

  return (
    <div className="pt-4">
      <div className="mx-auto max-w-[1440px] flex flex-col">
        <Link
          href="/hives"
          className="inline-flex items-center gap-2 text-base leading-[22px] font-normal text-[#172847] hover:text-[#3A1DC8] transition-colors"
        >
          <ArrowLeftIcon size={16} weight="bold" className="text-[#989898]" />
          All sessions
        </Link>

        <div className="flex flex-row items-center justify-between">
          <h1 className="text-[24px] leading-[31px] font-medium text-[#172847]">
            {title}
          </h1>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 bg-white border border-white px-1 py-1 rounded-sm">
              {tabs.map((tab) => {
                const isActive = activeSlug === tab.slug;
                return (
                  <Link
                    key={tab.slug}
                    href={`${basePath}/${tab.slug}`}
                    className={`inline-flex h-9 items-center justify-center rounded-sm px-3 text-[16px] font-medium leading-5 transition-colors ${
                      isActive
                        ? "bg-[#EDEFFD] text-[#3A1DC8]"
                        : "bg-[#FDFDFD] text-[#9498B0] hover:text-[#3A1DC8]"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-sm bg-white px-3 text-[16px] font-medium leading-5 text-[#9498B0] hover:text-[#3A1DC8] transition-colors"
            >
              <ExportIcon size={16} className="text-inherit" />
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
