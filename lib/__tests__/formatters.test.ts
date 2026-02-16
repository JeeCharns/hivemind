import { formatRelativeTimestamp } from "../formatters";

describe("formatRelativeTimestamp", () => {
  const now = new Date("2026-02-16T14:30:00Z");

  it('returns "just now" for timestamps less than 1 minute ago', () => {
    const thirtySecsAgo = new Date("2026-02-16T14:29:30Z");
    expect(formatRelativeTimestamp(thirtySecsAgo, now)).toBe("just now");
  });

  it('returns "Xm ago" for timestamps less than 1 hour ago', () => {
    const fiveMinsAgo = new Date("2026-02-16T14:25:00Z");
    expect(formatRelativeTimestamp(fiveMinsAgo, now)).toBe("5m ago");

    const thirtyMinsAgo = new Date("2026-02-16T14:00:00Z");
    expect(formatRelativeTimestamp(thirtyMinsAgo, now)).toBe("30m ago");
  });

  it('returns "Xh ago" for timestamps less than 24 hours ago', () => {
    const twoHoursAgo = new Date("2026-02-16T12:30:00Z");
    expect(formatRelativeTimestamp(twoHoursAgo, now)).toBe("2h ago");

    const twelveHoursAgo = new Date("2026-02-16T02:30:00Z");
    expect(formatRelativeTimestamp(twelveHoursAgo, now)).toBe("12h ago");
  });

  it('returns "yesterday at HH:MM" for yesterday', () => {
    const yesterday = new Date("2026-02-15T10:45:00Z");
    expect(formatRelativeTimestamp(yesterday, now)).toBe("yesterday at 10:45");
  });

  it("returns date and time for older dates in same year", () => {
    const lastWeek = new Date("2026-02-10T09:15:00Z");
    expect(formatRelativeTimestamp(lastWeek, now)).toBe("10 Feb at 09:15");

    const january = new Date("2026-01-05T16:30:00Z");
    expect(formatRelativeTimestamp(january, now)).toBe("5 Jan at 16:30");
  });

  it("returns date with year for different year", () => {
    const lastYear = new Date("2025-12-25T08:00:00Z");
    expect(formatRelativeTimestamp(lastYear, now)).toBe("25 Dec 2025 at 08:00");
  });

  it("handles string date input", () => {
    const dateStr = "2026-02-16T14:25:00Z";
    expect(formatRelativeTimestamp(dateStr, now)).toBe("5m ago");
  });

  it("formats time without seconds", () => {
    const withSeconds = new Date("2026-02-15T10:45:30Z");
    const result = formatRelativeTimestamp(withSeconds, now);
    expect(result).toBe("yesterday at 10:45");
    expect(result).not.toContain(":30");
  });
});
