/**
 * Conversation Tags - Shared Constants
 *
 * Tag definitions and styling used across Listen and Understand tabs
 * Follows SRP: single source of truth for tags
 */

import type { ListenTag } from "./listen.types";

const DEFAULT_TAG_CLASSES = "bg-gray-50 text-gray-700 border-gray-100 py-0.5";

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
export const tagColors: Record<ListenTag, string> = {
  data: "bg-blue-50 text-blue-700 border-blue-100 py-0.5",
  problem: "bg-red-50 text-red-700 border-red-100 py-0.5",
  need: "bg-amber-50 text-amber-700 border-amber-100 py-0.5",
  want: "bg-emerald-50 text-emerald-700 border-emerald-100 py-0.5",
  risk: "bg-orange-50 text-orange-700 border-orange-100 py-0.5",
  proposal: "bg-indigo-50 text-indigo-700 border-indigo-100 py-0.5",
};

export const tagSelectedRings: Record<ListenTag, string> = {
  data: "ring-blue-200",
  problem: "ring-red-200",
  need: "ring-amber-200",
  want: "ring-emerald-200",
  risk: "ring-orange-200",
  proposal: "ring-indigo-200",
};

const tagHoverClasses: Record<ListenTag, string> = {
  data: "hover:bg-blue-50 hover:border-blue-100 hover:text-blue-700",
  problem: "hover:bg-red-50 hover:border-red-100 hover:text-red-700",
  need: "hover:bg-amber-50 hover:border-amber-100 hover:text-amber-700",
  want: "hover:bg-emerald-50 hover:border-emerald-100 hover:text-emerald-700",
  risk: "hover:bg-orange-50 hover:border-orange-100 hover:text-orange-700",
  proposal: "hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-700",
};

/**
 * Get tag color classes
 *
 * @param tag - Tag to get colors for
 * @returns Tailwind classes for the tag
 */
export function getTagColors(tag: string | null): string {
  if (!tag) return DEFAULT_TAG_CLASSES;

  if (Object.prototype.hasOwnProperty.call(tagColors, tag)) {
    return tagColors[tag as ListenTag];
  }

  return DEFAULT_TAG_CLASSES;
}

export function getTagSelectedClasses(tag: ListenTag): string {
  return `${getTagColors(tag)} ${tagHoverClasses[tag]} ring-2 ring-offset-1 ${tagSelectedRings[tag]} shadow-sm`;
}

export function getTagHoverClasses(tag: ListenTag): string {
  return tagHoverClasses[tag];
}
