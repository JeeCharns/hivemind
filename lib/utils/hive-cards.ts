export type ConversationCardRow = {
  id: string;
  slug?: string | null;
  created_at?: string | null;
  analysis_status?: string | null;
  report_json?: unknown | null;
  type: "understand" | "decide";
  title?: string | null;
  description?: string | null;
};

export const formatHiveDate = (dateString?: string | null) => {
  if (!dateString) return "26 Nov 25";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "26 Nov 25";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
};

export const getConversationCta = (
  hiveKey: { slug?: string | null; id: string },
  row: ConversationCardRow
) => {
  const hiveHref = hiveKey.slug ?? hiveKey.id;
  const convoKey = row.slug ?? row.id;
  const base = `/hives/${hiveHref}/conversations/${convoKey}`;
  if (row.report_json) {
    return { label: "Result ready", href: `${base}/result` };
  }
  if (row.analysis_status === "ready") {
    return { label: "Analysis complete", href: `${base}/understand` };
  }
  return { label: "Submit your thoughts!", href: `${base}/listen` };
};
