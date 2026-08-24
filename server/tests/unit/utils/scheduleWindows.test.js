/**
 * Shared weekly-schedule primitives.
 *
 * These are pure functions over (days, weekday, minute-of-day), which is
 * deliberate: it lets the whole overnight/overlap contract be pinned down
 * without mocking a clock or a timezone. The clock-and-timezone half is
 * covered in tests/unit/services/detectionSchedule.resolver.test.js, which
 * drives these same functions through isScheduleActiveNow.
 */
import { describe, it, expect } from "vitest";

import {
  MINUTES_IN_DAY,
  WEEKDAYS,
  expandScheduleSegments,
  findScheduleConflict,
  hasAnyWindow,
  isOvernightWindow,
  isValidTimezone,
  isWithinScheduleDays,
  nextWeekday,
  previousWeekday,
  timeToMinutes,
} from "../../../utils/scheduleWindows.js";

const at = (hhmm) => timeToMinutes(hhmm);

describe("timeToMinutes", () => {
  it("converts HH:mm to minutes since local midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("returns NaN for anything unparseable rather than a wrong number", () => {
    expect(timeToMinutes("9am")).toBeNaN();
    expect(timeToMinutes("")).toBeNaN();
    expect(timeToMinutes(null)).toBeNaN();
    expect(timeToMinutes(undefined)).toBeNaN();
  });
});

describe("weekday arithmetic wraps the week", () => {
  it("walks forward, Sunday to Monday", () => {
    expect(nextWeekday("monday")).toBe("tuesday");
    expect(nextWeekday("sunday")).toBe("monday");
  });

  it("walks backward, Monday to Sunday", () => {
    expect(previousWeekday("tuesday")).toBe("monday");
    expect(previousWeekday("monday")).toBe("sunday");
  });

  it("returns null for a non-weekday instead of guessing", () => {
    expect(nextWeekday("caturday")).toBeNull();
    expect(previousWeekday(undefined)).toBeNull();
  });
});

describe("isOvernightWindow", () => {
  it("is true only when end is strictly before start", () => {
    expect(isOvernightWindow({ start: "22:00", end: "08:00" })).toBe(true);
    expect(isOvernightWindow({ start: "09:00", end: "18:00" })).toBe(false);
  });

  it("does not treat start === end as overnight", () => {
    // The trap this guards: reading 09:00-09:00 as a 24-hour window.
    expect(isOvernightWindow({ start: "09:00", end: "09:00" })).toBe(false);
  });
});

describe("expandScheduleSegments", () => {
  it("leaves a normal window on its own day, unsplit", () => {
    const segments = expandScheduleSegments({
      monday: [{ start: "09:00", end: "18:00" }],
    });

    expect(segments.monday).toEqual([
      { start: at("09:00"), end: at("18:00"), day: "monday", label: "09:00-18:00" },
    ]);
    expect(segments.tuesday).toEqual([]);
  });

  it("splits an overnight window across the day boundary", () => {
    const segments = expandScheduleSegments({
      monday: [{ start: "22:00", end: "08:00" }],
    });

    expect(segments.monday).toEqual([
      { start: at("22:00"), end: MINUTES_IN_DAY, day: "monday", label: "22:00-08:00" },
    ]);
    // The spill keeps `day: "monday"` so a conflict can be reported against
    // the range the user actually typed.
    expect(segments.tuesday).toEqual([
      { start: 0, end: at("08:00"), day: "monday", label: "22:00-08:00" },
    ]);
  });

  it("wraps Sunday's spill onto Monday", () => {
    const segments = expandScheduleSegments({
      sunday: [{ start: "23:00", end: "05:00" }],
    });

    expect(segments.monday).toEqual([
      { start: 0, end: at("05:00"), day: "sunday", label: "23:00-05:00" },
    ]);
  });

  it("gives a zero-length window no time at all", () => {
    const segments = expandScheduleSegments({
      monday: [{ start: "09:00", end: "09:00" }],
    });

    expect(segments.monday).toEqual([]);
    expect(segments.tuesday).toEqual([]);
  });

  it("skips unparseable windows instead of emitting NaN ranges", () => {
    const segments = expandScheduleSegments({
      monday: [{ start: "9am", end: "6pm" }],
    });

    expect(segments.monday).toEqual([]);
  });
});

describe("findScheduleConflict", () => {
  const conflict = (days) => findScheduleConflict(days);

  describe("accepts", () => {
    it("a single normal range", () => {
      expect(conflict({ monday: [{ start: "09:00", end: "18:00" }] })).toBeNull();
    });

    it("a single overnight range", () => {
      expect(conflict({ monday: [{ start: "22:00", end: "08:00" }] })).toBeNull();
    });

    it("multiple normal ranges in one day", () => {
      expect(
        conflict({
          monday: [
            { start: "09:00", end: "12:00" },
            { start: "14:00", end: "18:00" },
          ],
        }),
      ).toBeNull();
    });

    it("a normal range plus an overnight range in one day", () => {
      expect(
        conflict({
          monday: [
            { start: "09:00", end: "12:00" },
            { start: "22:00", end: "08:00" },
          ],
        }),
      ).toBeNull();
    });

    it("adjacent ranges that touch at a boundary", () => {
      // Half-open [start, end): 12:00 belongs to the second range only, so
      // this is not an overlap. Unchanged from the original rule.
      expect(
        conflict({
          monday: [
            { start: "09:00", end: "12:00" },
            { start: "12:00", end: "18:00" },
          ],
        }),
      ).toBeNull();
    });

    it("an overnight range ending exactly where the next day's range starts", () => {
      expect(
        conflict({
          monday: [{ start: "22:00", end: "08:00" }],
          tuesday: [{ start: "08:00", end: "17:00" }],
        }),
      ).toBeNull();
    });

    it("an overnight range on every day of the week", () => {
      const days = Object.fromEntries(
        WEEKDAYS.map((day) => [day, [{ start: "22:00", end: "06:00" }]]),
      );
      expect(conflict(days)).toBeNull();
    });
  });

  describe("rejects", () => {
    it("a zero-length range, explicitly rather than reading it as all-day", () => {
      expect(conflict({ monday: [{ start: "09:00", end: "09:00" }] })).toMatchObject({
        type: "zero-length",
        day: "monday",
      });
    });

    it("plain same-day overlap, with the long-standing message", () => {
      expect(
        conflict({
          monday: [
            { start: "09:00", end: "12:00" },
            { start: "11:00", end: "14:00" },
          ],
        }),
      ).toMatchObject({
        type: "overlap",
        message: "monday schedule windows cannot overlap",
      });
    });

    it("an exact duplicate range", () => {
      expect(
        conflict({
          monday: [
            { start: "09:00", end: "12:00" },
            { start: "09:00", end: "12:00" },
          ],
        }),
      ).toMatchObject({ type: "overlap" });
    });

    it("an overnight range colliding on its own day (18:00-23:00 vs 22:00-08:00)", () => {
      expect(
        conflict({
          monday: [
            { start: "18:00", end: "23:00" },
            { start: "22:00", end: "08:00" },
          ],
        }),
      ).toMatchObject({ type: "overlap", day: "monday" });
    });

    it("an overnight range colliding on the NEXT day (00:00-08:00 vs 06:00-10:00)", () => {
      const result = conflict({
        monday: [{ start: "22:00", end: "08:00" }],
        tuesday: [{ start: "06:00", end: "10:00" }],
      });

      expect(result).toMatchObject({ type: "overlap-overnight", day: "tuesday" });
      // Both sides named, so the user can find the range to fix.
      expect(result.message).toContain("monday overnight window 22:00-08:00");
      expect(result.message).toContain("tuesday 06:00-10:00");
    });

    it("a Sunday overnight range colliding on Monday", () => {
      expect(
        conflict({
          sunday: [{ start: "22:00", end: "08:00" }],
          monday: [{ start: "07:00", end: "09:00" }],
        }),
      ).toMatchObject({ type: "overlap-overnight", day: "monday" });
    });

    it("two overnight ranges on the same day", () => {
      expect(
        conflict({
          monday: [
            { start: "22:00", end: "08:00" },
            { start: "23:00", end: "07:00" },
          ],
        }),
      ).toMatchObject({ type: "overlap" });
    });

    it("an unparseable time", () => {
      expect(conflict({ monday: [{ start: "9am", end: "6pm" }] })).toMatchObject({
        type: "invalid",
        day: "monday",
      });
    });
  });
});

describe("hasAnyWindow", () => {
  it("is false for an empty or absent schedule", () => {
    expect(hasAnyWindow({})).toBe(false);
    expect(hasAnyWindow({ monday: [] })).toBe(false);
    expect(hasAnyWindow(undefined)).toBe(false);
  });

  it("is true as soon as one day carries a window", () => {
    expect(hasAnyWindow({ saturday: [{ start: "09:00", end: "10:00" }] })).toBe(true);
  });
});

describe("isWithinScheduleDays", () => {
  describe("normal ranges behave exactly as before", () => {
    const days = { monday: [{ start: "09:00", end: "18:00" }] };

    it("is inclusive of start and exclusive of end", () => {
      expect(isWithinScheduleDays(days, "monday", at("08:59"))).toBe(false);
      expect(isWithinScheduleDays(days, "monday", at("09:00"))).toBe(true);
      expect(isWithinScheduleDays(days, "monday", at("17:59"))).toBe(true);
      expect(isWithinScheduleDays(days, "monday", at("18:00"))).toBe(false);
    });

    it("does not leak onto the following day", () => {
      expect(isWithinScheduleDays(days, "tuesday", at("10:00"))).toBe(false);
    });
  });

  describe("the spec's overnight walkthrough: Monday 22:00 -> 08:00", () => {
    const days = { monday: [{ start: "22:00", end: "08:00" }] };

    it.each([
      ["monday", "21:59", false],
      ["monday", "22:00", true],
      ["monday", "23:59", true],
      ["tuesday", "00:00", true],
      ["tuesday", "07:59", true],
      ["tuesday", "08:00", false],
    ])("%s %s -> %s", (day, hhmm, expected) => {
      expect(isWithinScheduleDays(days, day, at(hhmm))).toBe(expected);
    });

    it("does not bleed into any other day", () => {
      expect(isWithinScheduleDays(days, "tuesday", at("22:00"))).toBe(false);
      expect(isWithinScheduleDays(days, "wednesday", at("03:00"))).toBe(false);
      expect(isWithinScheduleDays(days, "sunday", at("23:00"))).toBe(false);
    });
  });

  it("carries a Sunday overnight range into Monday", () => {
    const days = { sunday: [{ start: "23:00", end: "05:00" }] };

    expect(isWithinScheduleDays(days, "sunday", at("23:30"))).toBe(true);
    expect(isWithinScheduleDays(days, "monday", at("04:59"))).toBe(true);
    expect(isWithinScheduleDays(days, "monday", at("05:00"))).toBe(false);
  });

  it("handles a normal and an overnight range on the same day", () => {
    const days = {
      monday: [
        { start: "09:00", end: "12:00" },
        { start: "22:00", end: "08:00" },
      ],
    };

    expect(isWithinScheduleDays(days, "monday", at("10:00"))).toBe(true);
    expect(isWithinScheduleDays(days, "monday", at("13:00"))).toBe(false);
    expect(isWithinScheduleDays(days, "monday", at("23:00"))).toBe(true);
    expect(isWithinScheduleDays(days, "tuesday", at("03:00"))).toBe(true);
    expect(isWithinScheduleDays(days, "tuesday", at("10:00"))).toBe(false);
  });

  it("chains consecutive overnight ranges without a gap at the handover", () => {
    const days = {
      monday: [{ start: "20:00", end: "08:00" }],
      tuesday: [{ start: "20:00", end: "08:00" }],
    };

    expect(isWithinScheduleDays(days, "tuesday", at("07:59"))).toBe(true);
    expect(isWithinScheduleDays(days, "tuesday", at("08:00"))).toBe(false); // daytime gap
    expect(isWithinScheduleDays(days, "tuesday", at("20:00"))).toBe(true);
    expect(isWithinScheduleDays(days, "wednesday", at("03:00"))).toBe(true);
  });

  it("covers nothing for a zero-length range", () => {
    const days = { monday: [{ start: "09:00", end: "09:00" }] };

    expect(isWithinScheduleDays(days, "monday", at("09:00"))).toBe(false);
    expect(isWithinScheduleDays(days, "monday", at("12:00"))).toBe(false);
    expect(isWithinScheduleDays(days, "tuesday", at("03:00"))).toBe(false);
  });

  it("is false for a day with no ranges, an unknown day, or a bad minute", () => {
    const days = { monday: [{ start: "09:00", end: "18:00" }] };

    expect(isWithinScheduleDays(days, "saturday", at("10:00"))).toBe(false);
    expect(isWithinScheduleDays(days, "caturday", at("10:00"))).toBe(false);
    expect(isWithinScheduleDays(days, "monday", NaN)).toBe(false);
  });
});

describe("isValidTimezone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("accepts legacy aliases the runtime still understands", () => {
    // getTimezones() renames this for display, but stored rows may hold it.
    expect(isValidTimezone("Asia/Calcutta")).toBe(true);
  });

  it("rejects invented zones and non-strings", () => {
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("   ")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(5)).toBe(false);
  });
});
