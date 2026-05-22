/**
 * src/page/user/EmployeeLogs/components/timeUtils.js — pure utility
 * helpers for the 12-hour time-picker on the logs filter popover.
 * Five exports:
 *   - generateHourOptions   (returns ["01".."12"])
 *   - generateMinuteOptions (returns ["00".."59"])
 *   - generatePeriodOptions (returns ["AM","PM"])
 *   - parseTime("HH:MM AM"/"HH:MM"/"" ) -> { hour, minute, period }
 *   - formatTime(h, m, p)   -> "HH:MM P" or "" when any arg falsy
 *
 * Pure functions — no module-level mocks needed.
 * Mocks: 0
 */
import { describe, it, expect } from "vitest";
import {
  generateHourOptions,
  generateMinuteOptions,
  generatePeriodOptions,
  parseTime,
  formatTime,
} from "../../../../../../src/page/user/EmployeeLogs/components/timeUtils.js";

describe("EmployeeLogs/components/timeUtils generateHourOptions", () => {
  it("returns 12 zero-padded strings 01..12", () => {
    const hours = generateHourOptions();
    expect(hours).toHaveLength(12);
    expect(hours[0]).toBe("01");
    expect(hours[8]).toBe("09");
    expect(hours[9]).toBe("10");
    expect(hours[11]).toBe("12");
    hours.forEach((h) => expect(h).toMatch(/^\d{2}$/));
  });
});

describe("EmployeeLogs/components/timeUtils generateMinuteOptions", () => {
  it("returns 60 zero-padded strings 00..59", () => {
    const mins = generateMinuteOptions();
    expect(mins).toHaveLength(60);
    expect(mins[0]).toBe("00");
    expect(mins[5]).toBe("05");
    expect(mins[10]).toBe("10");
    expect(mins[59]).toBe("59");
    mins.forEach((m) => expect(m).toMatch(/^\d{2}$/));
  });
});

describe("EmployeeLogs/components/timeUtils generatePeriodOptions", () => {
  it("returns ['AM', 'PM']", () => {
    expect(generatePeriodOptions()).toEqual(["AM", "PM"]);
  });
});

describe("EmployeeLogs/components/timeUtils parseTime", () => {
  it("returns empty parts for empty / whitespace / undefined input", () => {
    expect(parseTime("")).toEqual({ hour: "", minute: "", period: "" });
    expect(parseTime("   ")).toEqual({ hour: "", minute: "", period: "" });
    expect(parseTime(undefined)).toEqual({ hour: "", minute: "", period: "" });
    expect(parseTime(null)).toEqual({ hour: "", minute: "", period: "" });
  });

  it("parses standard 'HH:MM AM' format", () => {
    expect(parseTime("09:30 AM")).toEqual({
      hour: "09",
      minute: "30",
      period: "AM",
    });
  });

  it("parses 'HH:MM PM' and normalises lower-case period", () => {
    expect(parseTime("11:45 pm")).toEqual({
      hour: "11",
      minute: "45",
      period: "PM",
    });
  });

  it("returns empty period when the suffix is not AM/PM", () => {
    expect(parseTime("08:15 XX")).toEqual({
      hour: "08",
      minute: "15",
      period: "",
    });
  });

  it("handles time string without an AM/PM suffix", () => {
    expect(parseTime("14:05")).toEqual({
      hour: "14",
      minute: "05",
      period: "",
    });
  });
});

describe("EmployeeLogs/components/timeUtils formatTime", () => {
  it("returns 'HH:MM P' when all three parts are provided", () => {
    expect(formatTime("9", "5", "AM")).toBe("09:05 AM");
    expect(formatTime("12", "30", "PM")).toBe("12:30 PM");
  });

  it("preserves already-padded values", () => {
    expect(formatTime("09", "00", "AM")).toBe("09:00 AM");
  });

  it("returns '' when any of hour / minute / period is missing", () => {
    expect(formatTime("", "30", "AM")).toBe("");
    expect(formatTime("09", "", "AM")).toBe("");
    expect(formatTime("09", "30", "")).toBe("");
    expect(formatTime()).toBe("");
  });
});
