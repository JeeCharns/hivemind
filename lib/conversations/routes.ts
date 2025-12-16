/**
 * Conversation Route Helpers
 *
 * Pure functions for generating conversation URLs
 * Follows SRP: single responsibility of route construction
 */

/**
 * Get the base URL for a conversation
 *
 * @param hiveKey - Hive slug or ID
 * @param convoKey - Conversation slug or ID
 * @returns Base conversation URL
 */
export function conversationBase(hiveKey: string, convoKey: string): string {
  return `/hives/${hiveKey}/conversations/${convoKey}`;
}

/**
 * Get the URL for a specific conversation tab
 *
 * @param hiveKey - Hive slug or ID
 * @param convoKey - Conversation slug or ID
 * @param tab - Tab name (listen, understand, result)
 * @returns Full tab URL
 */
export function tabHref(
  hiveKey: string,
  convoKey: string,
  tab: "listen" | "understand" | "result"
): string {
  return `${conversationBase(hiveKey, convoKey)}/${tab}`;
}
