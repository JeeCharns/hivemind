export type ConversationPhase =
  | "listen_open"
  | "understand_open"
  | "respond_open"
  | "vote_open"
  | "report_open"
  | "closed"
  | string;

const phaseOrder: ConversationPhase[] = [
  "listen_open",
  "understand_open",
  "respond_open",
  "vote_open",
  "report_open",
];

const phaseIndex = (phase: string) => phaseOrder.indexOf(phase as ConversationPhase);

export const MIN_RESPONSES_FOR_REPORT = 30;

export function canOpenReport(
  phase: string,
  responseCount: number | null | undefined
): { allowed: boolean; reason?: string } {
  const count = responseCount ?? 0;
  if (count < MIN_RESPONSES_FOR_REPORT) {
    return {
      allowed: false,
      reason: `Report phase not open. At least ${MIN_RESPONSES_FOR_REPORT} responses are required.`,
    };
  }
  const currentIdx = phaseIndex(phase);
  const targetIdx = phaseIndex("report_open");
  if (currentIdx >= 0 && currentIdx < targetIdx) {
    return {
      allowed: true,
      reason: "Advance phase to report_open",
    };
  }
  return { allowed: true };
}
