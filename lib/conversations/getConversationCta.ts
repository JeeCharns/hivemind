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
 * - Deliberate conversations route to /discuss
 * - Other conversations route to /listen
 *
 * CTA labels indicate conversation state:
 * 1. If report is ready -> "Result ready"
 * 2. If analysis is complete -> "Analysis complete"
 * 3. For deliberate -> "Join discussion"
 * 4. Otherwise -> "Submit your thoughts!"
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

  // Deliberate conversations go to discuss tab
  if (conversation.type === "deliberate") {
    return {
      label: "Join discussion",
      href: `${base}/discuss`,
    };
  }

  // Other conversations go to listen tab with state-based label
  let label: string;

  if (conversation.report_json) {
    label = "Result ready";
  } else if (conversation.analysis_status === "ready") {
    label = "Analysis complete";
  } else {
    label = "Submit your thoughts!";
  }

  return {
    label,
    href: `${base}/listen`,
  };
}
