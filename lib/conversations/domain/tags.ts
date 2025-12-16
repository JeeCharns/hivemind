/**
 * Conversation Tags - Shared Constants
 *
 * Tag definitions and styling used across Listen and Understand tabs
 * Follows SRP: single source of truth for tags
 */

import type { ListenTag } from "./listen.types";

/**
 * Available tags for responses
 */
export const LISTEN_TAGS: ListenTag[] = [
  "need",
  "data",
  "want",
  "problem",
  "risk",
  "proposal",
];

/**
 * Tag display labels
 */
export const TAG_LABELS: Record<ListenTag, string> = {
  need: "Need",
  data: "Data",
  want: "Want",
  problem: "Problem",
  risk: "Risk",
  proposal: "Proposal",
};

/**
 * Tag color styling (Tailwind classes)
 * Copied from temp/components/understand-view.tsx
 */
export const tagColors: Record<string, string> = {
  data: "bg-blue-50 text-blue-700 border-blue-100 py-0.5",
  problem: "bg-red-50 text-red-700 border-red-100 py-0.5",
  need: "bg-amber-50 text-amber-700 border-amber-100 py-0.5",
  want: "bg-emerald-50 text-emerald-700 border-emerald-100 py-0.5",
  risk: "bg-orange-50 text-orange-700 border-orange-100 py-0.5",
  proposal: "bg-indigo-50 text-indigo-700 border-indigo-100 py-0.5",
};

/**
 * Get tag color classes
 *
 * @param tag - Tag to get colors for
 * @returns Tailwind classes for the tag
 */
export function getTagColors(tag: string | null): string {
  if (!tag) return "bg-gray-50 text-gray-700 border-gray-100 py-0.5";
  return tagColors[tag] || "bg-gray-50 text-gray-700 border-gray-100 py-0.5";
}
