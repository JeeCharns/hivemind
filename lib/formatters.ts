/**
 * Format a timestamp as a human-readable relative time string.
 *
 * Examples:
 * - "just now" for < 1 minute
 * - "5m ago" for < 1 hour
 * - "2h ago" for < 24 hours
 * - "yesterday at 10:45" for yesterday
 * - "10 Feb at 09:15" for same year
 * - "25 Dec 2025 at 08:00" for previous years
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

  // Format the time portion
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
    return `yesterday at ${timeStr}`;
  }

  // Format the date portion
  const day = date.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month} at ${timeStr}`;
  }

  // Different year
  return `${day} ${month} ${date.getFullYear()} at ${timeStr}`;
}
