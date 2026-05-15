import { describe, it, expect } from "vitest";
import {
  formatDateRange,
  formatDate,
  formatDateCorrectDetection,
  formatDateCorrect,
} from "../../../src/utils/formatDateRange.js";

describe("formatDateRange", () => {
  it("returns empty string when either bound is missing", () => {
    expect(formatDateRange(null, "2026-01-02")).toBe("");
    expect(formatDateRange("2026-01-01", null)).toBe("");
    expect(formatDateRange(undefined, undefined)).toBe("");
  });

  it("formats a start-end range as 'Mon D - Mon D'", () => {
    const out = formatDateRange("2026-01-05", "2026-01-20");
    expect(out).toMatch(/^\w{3} \d{1,2} - \w{3} \d{1,2}$/);
    expect(out).toContain(" - ");
  });
});

describe("formatDate", () => {
  it("returns empty string when a bound is missing", () => {
    expect(formatDate(null, "2026-01-02")).toBe("");
    expect(formatDate("2026-01-01", null)).toBe("");
  });

  it("returns only the start date in 'DD Mon YYYY' style", () => {
    const out = formatDate("2026-03-09", "2026-03-20");
    // Source intentionally returns just the start string.
    expect(out).toMatch(/\d{2} \w{3} \d{4}/);
    expect(out).not.toContain(" - ");
  });
});

describe("formatDateCorrectDetection", () => {
  it("formats a Date as YYYY-MM-DD (en-CA locale)", () => {
    const d = new Date(2026, 0, 7); // 7 Jan 2026, local time
    expect(formatDateCorrectDetection(d)).toBe("2026-01-07");
  });

  it("zero-pads month and day", () => {
    expect(formatDateCorrectDetection(new Date(2026, 8, 3))).toBe("2026-09-03");
  });
});

describe("formatDateCorrect", () => {
  it("formats to compact ISO basic 'YYYYMMDDTHHMMSSZ'", () => {
    const d = new Date(2026, 0, 7, 9, 5, 3); // local time
    expect(formatDateCorrect(d)).toBe("20260107T090503Z");
  });

  it("zero-pads every component", () => {
    const d = new Date(2026, 10, 1, 0, 0, 0);
    expect(formatDateCorrect(d)).toBe("20261101T000000Z");
  });

  it("accepts a date string input", () => {
    expect(formatDateCorrect("2026-01-07T09:05:03")).toMatch(
      /^\d{8}T\d{6}Z$/
    );
  });
});
