/**
 * Format a timestamp as a human-readable relative time string.
 *
 * Examples:
 * - "just now" for < 1 minute
 * - "1m ago" for < 1 hour
 * - "1h ago" for < 24 hours
 * - "Yesterday 12:30" for yesterday
 * - "January 20 2026 12:39" for older dates
 */
export function formatRelativeTimestamp(
  timestamp: Date | string,
  now: Date = new Date()
): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // Less than 1 minute
  if (diffMins < 1) {
    return "just now";
  }

  // Less than 1 hour
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  // Format the time portion (no seconds)
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return `Yesterday ${timeStr}`;
  }

  // Full month names
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  // Format: "January 20 2026 12:39"
  return `${month} ${day} ${year} ${timeStr}`;
}
