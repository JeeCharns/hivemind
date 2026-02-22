/**
 * Report HTML Utilities Tests
 *
 * Tests for HTML sanitization and conversion
 */

import { reportContentToHtml, sanitizeHtml, escapeHtml } from "../reportHtml";

describe("escapeHtml", () => {
  it("should escape < > & characters", () => {
    const result = escapeHtml("<div>Test & Go</div>");
    expect(result).toBe("&lt;div&gt;Test &amp; Go&lt;/div&gt;");
  });

  it("should escape quotes", () => {
    const result = escapeHtml("He said \"hello\" and 'goodbye'");
    expect(result).toBe("He said &quot;hello&quot; and &#39;goodbye&#39;");
  });

  it("should handle empty string", () => {
    const result = escapeHtml("");
    expect(result).toBe("");
  });

  it("should not double-escape", () => {
    const result = escapeHtml("&lt;div&gt;");
    expect(result).toBe("&amp;lt;div&amp;gt;");
  });
});

describe("sanitizeHtml", () => {
  it("should remove script tags", () => {
    const html = '<div>Safe</div><script>alert("XSS")</script><p>More safe</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("<div>Safe</div>");
    expect(result).toContain("<p>More safe</p>");
  });

  it("should remove script tags with attributes", () => {
    const html =
      '<script type="text/javascript" src="evil.js">var x = 1;</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("var x");
  });

  it("should handle multiple script tags", () => {
    const html = "<script>one</script><p>safe</p><script>two</script>";
    const result = sanitizeHtml(html);
    expect(result).toBe("<p>safe</p>");
  });

  it("should be case insensitive", () => {
    const html = "<SCRIPT>alert(1)</SCRIPT><p>safe</p>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("SCRIPT");
    expect(result).toContain("<p>safe</p>");
  });

  it("should handle empty string", () => {
    const result = sanitizeHtml("");
    expect(result).toBe("");
  });

  it("should preserve other HTML", () => {
    const html = '<div class="test"><h1>Title</h1><p>Content</p></div>';
    const result = sanitizeHtml(html);
    expect(result).toBe(html);
  });
});

describe("reportContentToHtml", () => {
  it("should return empty string for null", () => {
    const result = reportContentToHtml(null);
    expect(result).toBe("");
  });

  it("should sanitize HTML strings", () => {
    const html = "<div>Safe</div><script>alert(1)</script>";
    const result = reportContentToHtml(html);
    expect(result).not.toContain("<script>");
    expect(result).toContain("<div>Safe</div>");
  });

  it("should handle markdown in object", () => {
    const content = { markdown: "# Hello\n\nWorld" };
    const result = reportContentToHtml(content);
    expect(result).toContain("<pre>");
    expect(result).toContain("# Hello");
    expect(result).not.toContain("<script>");
  });

  it("should handle other object types", () => {
    const content = { foo: "bar", baz: 123 };
    const result = reportContentToHtml(content);
    expect(result).toContain("<pre>");
    expect(result).toContain("&quot;foo&quot;");
    expect(result).toContain("&quot;bar&quot;");
  });

  it("should escape HTML in markdown", () => {
    const content = { markdown: "<script>alert(1)</script>" };
    const result = reportContentToHtml(content);
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("should handle plain HTML string without script tags", () => {
    const html = "<h1>Title</h1><p>Content</p>";
    const result = reportContentToHtml(html);
    expect(result).toBe(html);
  });
});
