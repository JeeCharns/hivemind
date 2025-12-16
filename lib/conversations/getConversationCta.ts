/**
 * Get Conversation CTA (Call to Action)
 *
 * Pure function that determines the appropriate CTA for a conversation card
 * Follows SRP: single responsibility of CTA logic
 * Unit-testable: no side effects, deterministic output
 */

import type { ConversationCardData } from "@/types/conversations";

export interface ConversationCta {
  label: string;
  href: string;
}

/**
 * Determines the CTA based on conversation state
 *
 * Business logic:
 * 1. If report is ready -> "Result ready" -> /result page
 * 2. If analysis is complete -> "Analysis complete" -> /understand page
 * 3. Otherwise -> "Submit your thoughts!" -> /listen page (data collection)
 *
 * @param hiveKey - Hive identifier (slug or ID)
 * @param conversation - Conversation data
 * @returns CTA with label and href
 */
export function getConversationCta(
  hiveKey: string,
  conversation: ConversationCardData
): ConversationCta {
  const convoKey = conversation.slug ?? conversation.id;
  const base = `/hives/${hiveKey}/conversations/${convoKey}`;

  // Priority 1: Report is ready
  if (conversation.report_json) {
    return {
      label: "Result ready",
      href: `${base}/result`,
    };
  }

  // Priority 2: Analysis is complete
  if (conversation.analysis_status === "ready") {
    return {
      label: "Analysis complete",
      href: `${base}/understand`,
    };
  }

  // Priority 3: Default - collect responses
  return {
    label: "Submit your thoughts!",
    href: `${base}/listen`,
  };
}
