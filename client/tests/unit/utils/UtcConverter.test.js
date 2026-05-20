/**
 * `formatFromToTimestamps` rewrites a "from <ts1> to <ts2>" substring into
 * a human-readable range plus a seconds duration. No I/O — pure string work.
 */
import { describe, it, expect } from "vitest";
import { formatFromToTimestamps } from "../../../src/utils/UtcConverter.jsx";

describe("formatFromToTimestamps", () => {
  it("rewrites a matching timestamp range with duration", () => {
    // Moment formats in local time, so we assert structure + the
    // timezone-independent duration rather than exact hours.
    const input =
      "Event from 2026-05-19T10:00:00.000000+00:00 to 2026-05-19T10:05:00.000000+00:00";
    const out = formatFromToTimestamps(input);
    expect(out).toMatch(/from \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} to \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(300 seconds\)/);
  });

  it("returns the original text when there is no match", () => {
    const input = "Nothing to see here";
    expect(formatFromToTimestamps(input)).toBe(input);
  });

  it("is case-insensitive on the 'from'/'to' keywords", () => {
    const input =
      "FROM 2026-05-19T10:00:00.000000+00:00 TO 2026-05-19T10:01:00.000000+00:00";
    const out = formatFromToTimestamps(input);
    expect(out).toMatch(/\(60 seconds\)/);
  });

  it("leaves invalid timestamps untouched", () => {
    const input = "from not-a-date to also-not-a-date+00:00";
    expect(formatFromToTimestamps(input)).toBe(input);
  });

  it("trims microsecond precision down to milliseconds before parsing", () => {
    // 1.500000+00:00 has 6 fractional digits → the helper drops the last 3.
    const input =
      "Span from 2026-05-19T10:00:00.123456+00:00 to 2026-05-19T10:00:02.456789+00:00";
    const out = formatFromToTimestamps(input);
    expect(out).toMatch(/\(2 seconds\)/);
  });
});
