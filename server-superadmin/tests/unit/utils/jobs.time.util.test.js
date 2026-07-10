/**
 * Unit tests for core/v1/jobs/utils/time.util.js
 *
 * Pure dayjs-based time helpers — no mocks needed.
 */
import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const {
  getExecutionDate,
  getExpectedRunAt,
  getDelayMinutes,
  getNowInTimeZone,
} = await import("../../../core/v1/jobs/utils/time.util.js");

describe("getExecutionDate", () => {
  it("converts a base date + time + UTC tz into a Date object", () => {
    const date = getExecutionDate({
      baseDate: "2026-05-20",
      time: "09:30",
      timezone: "UTC",
    });
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe("2026-05-20T09:30:00.000Z");
  });

  it("interprets the time in the given (Asia/Kolkata) timezone", () => {
    const date = getExecutionDate({
      baseDate: "2026-05-20",
      time: "09:30",
      timezone: "Asia/Kolkata",
    });
    // IST = UTC+5:30, so 09:30 IST -> 04:00 UTC.
    expect(date.toISOString()).toBe("2026-05-20T04:00:00.000Z");
  });

  it("adds one day when isNextDay is true", () => {
    const date = getExecutionDate({
      baseDate: "2026-05-20",
      time: "09:30",
      timezone: "UTC",
      isNextDay: true,
    });
    expect(date.toISOString()).toBe("2026-05-21T09:30:00.000Z");
  });

  it("defaults isNextDay to false when omitted", () => {
    const date = getExecutionDate({
      baseDate: "2026-05-20",
      time: "00:00",
      timezone: "UTC",
    });
    expect(date.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });
});

describe("getExpectedRunAt", () => {
  it("returns a dayjs object for the requested day-of-week", () => {
    // dayIndex 1 = Monday (dayjs week starts on Sunday=0).
    const runAt = getExpectedRunAt("09:00", "UTC", 1);
    expect(typeof runAt.format).toBe("function");
    expect(runAt.day()).toBe(1);
    expect(runAt.hour()).toBe(9);
    expect(runAt.minute()).toBe(0);
    expect(runAt.second()).toBe(0);
    expect(runAt.millisecond()).toBe(0);
  });

  it("honors the requested timezone for hour/minute", () => {
    const runAt = getExpectedRunAt("14:45", "Asia/Kolkata", 3);
    expect(runAt.hour()).toBe(14);
    expect(runAt.minute()).toBe(45);
  });

  it("zeroes out seconds and milliseconds", () => {
    const runAt = getExpectedRunAt("08:15", "UTC", 0);
    expect(runAt.second()).toBe(0);
    expect(runAt.millisecond()).toBe(0);
  });
});

describe("getDelayMinutes", () => {
  it("returns a positive delay when the expected time is in the past", () => {
    const past = dayjs().subtract(5, "minute");
    const delay = getDelayMinutes(past);
    expect(delay).toBeGreaterThan(4);
    expect(delay).toBeLessThan(6);
  });

  it("returns a negative delay when the expected time is in the future", () => {
    const future = dayjs().add(10, "minute");
    const delay = getDelayMinutes(future);
    expect(delay).toBeLessThan(-9);
    expect(delay).toBeGreaterThan(-11);
  });

  it("returns ~0 when the expected time is now", () => {
    const now = dayjs();
    const delay = getDelayMinutes(now);
    expect(Math.abs(delay)).toBeLessThan(0.1);
  });
});

describe("getNowInTimeZone", () => {
  it("returns a dayjs object anchored to the requested timezone", () => {
    const now = getNowInTimeZone("UTC");
    expect(typeof now.format).toBe("function");
    // Should match the current UTC hour within +-1 (test latency tolerance).
    const expectedHour = dayjs().utc().hour();
    expect(Math.abs(now.hour() - expectedHour)).toBeLessThanOrEqual(1);
  });

  it("returns different hours for different timezones at the same instant", () => {
    const utcNow = getNowInTimeZone("UTC");
    const istNow = getNowInTimeZone("Asia/Kolkata");
    // IST is +5:30 ahead of UTC, so hours should differ (unless a wrap puts
    // them coincidentally equal — extremely unlikely both checks fail).
    const diff = (istNow.hour() - utcNow.hour() + 24) % 24;
    expect([5, 6]).toContain(diff);
  });
});
