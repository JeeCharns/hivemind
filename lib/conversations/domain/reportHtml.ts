/**
 * Report HTML Utilities - Domain Logic
 *
 * Pure functions for converting and sanitizing report content
 * Follows SRP: HTML processing separate from business logic
 */

import type { ReportContent } from "@/types/conversation-report";

/**
 * Converts report content to sanitized HTML string
 *
 * Handles multiple formats:
 * - String: sanitize and return
 * - Object with markdown: escape and wrap in pre
 * - Null: return empty string
 *
 * @param content - Report content in various formats
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
export function reportContentToHtml(content: ReportContent): string {
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return sanitizeHtml(content);
  }

  // Handle structured report (markdown or other fields)
  if (typeof content === "object" && content.markdown) {
    return `<pre>${escapeHtml(content.markdown)}</pre>`;
  }

  // Fallback: stringify the object
  return `<pre>${escapeHtml(JSON.stringify(content, null, 2))}</pre>`;
}

/**
 * Sanitizes HTML by removing script tags
 *
 * Minimal sanitization to prevent XSS while preserving formatting
 * Removes <script> tags and their contents
 *
 * @param html - Raw HTML string
 * @returns Sanitized HTML with scripts removed
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their contents
  return html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
}

/**
 * Escapes HTML special characters
 *
 * Converts <, >, &, ", ' to HTML entities
 *
 * @param text - Plain text to escape
 * @returns HTML-safe string
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Creates a downloadable HTML file blob
 *
 * @param html - HTML content to download
 * @param filename - Name for the downloaded file
 */
export function downloadHtmlBlob(
  html: string,
  filename: string = "executive-summary.html"
): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
