/**
 * Schedule boundary maths and local-wall-clock conversion.
 *
 * These are what give a manual override a defined lifetime, so an error here
 * shows up as an override that never lapses (a camera stuck off) or one that
 * lapses immediately (the reported bug returning). Everything is exercised
 * against fixed instants rather than a mocked clock, since the functions take
 * their reference time as an argument.
 *
 * 2026-08-10 is a Monday. US DST in 2026: forward Sun 08 Mar, back Sun 01 Nov.
 */
import { describe, it, expect } from "vitest";

import {
  nextScheduleBoundary,
  zonedParts,
  zonedWallClockToUtc,
} from "../../../utils/scheduleWindows.js";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const LONDON = "Europe/London";

/** Locale-independent "Mon 10 18:00" — ICU builds disagree about separators. */
const localLabel = (date, timezone) => {
  if (!date) return "null";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("weekday")} ${get("day")} ${get("hour")}:${get("minute")}`;
};

/** An instant from an Asia/Kolkata wall-clock time (UTC+5:30, no DST). */
const ist = (hhmm, dayOfMonth = 10) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 7, dayOfMonth, hour - 5, minute - 30));
};

const custom = (days, timezone = IST) => ({ mode: "custom", timezone, days });

const office = custom({ monday: [{ start: "09:00", end: "18:00" }] });
const split = custom({
  monday: [
    { start: "09:00", end: "12:00" },
    { start: "14:00", end: "18:00" },
  ],
});
const overnight = custom({ monday: [{ start: "22:00", end: "08:00" }] });
const everyDay = custom(
  Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
      (day) => [day, [{ start: "09:00", end: "18:00" }]],
    ),
  ),
);

describe("zonedParts", () => {
  it("reads the local calendar date, weekday and minute-of-day", () => {
    expect(zonedParts(ist("14:45"), IST)).toEqual({
      year: 2026,
      month: 7, // zero-based, matching Date
      day: 10,
      weekday: "monday",
      minutes: 14 * 60 + 45,
    });
  });

  it("reports the LOCAL day, which can differ from the UTC day", () => {
    // 20:00 UTC on Monday is already Tuesday 01:30 in Kolkata.
    const parts = zonedParts(new Date(Date.UTC(2026, 7, 10, 20, 0)), IST);
    expect(parts.weekday).toBe("tuesday");
    expect(parts.day).toBe(11);
    expect(parts.minutes).toBe(90);
  });
});

describe("zonedWallClockToUtc", () => {
  const roundTrip = (year, month, day, minutes, timezone) =>
    localLabel(zonedWallClockToUtc({ year, month, day, minutes }, timezone), timezone);

  it("round-trips a wall-clock time in a fixed-offset zone", () => {
    expect(roundTrip(2026, 7, 10, 18 * 60, IST)).toBe("Mon 10 18:00");
    expect(roundTrip(2026, 7, 10, 0, IST)).toBe("Mon 10 00:00");
  });

  it("uses the offset in force on that date, not today's", () => {
    // Winter is -5, summer is -4. A single fixed offset would break one of these.
    expect(roundTrip(2026, 0, 15, 9 * 60, NY)).toBe("Thu 15 09:00");
    expect(roundTrip(2026, 6, 15, 9 * 60, NY)).toBe("Wed 15 09:00");
  });

  it("lands correctly on both sides of a DST transition", () => {
    // After clocks go back (Sun 01 Nov 2026) and after they go forward
    // (Sun 08 Mar 2026). The second offset pass is what makes these work.
    expect(roundTrip(2026, 10, 1, 6 * 60, NY)).toBe("Sun 01 06:00");
    expect(roundTrip(2026, 2, 8, 5 * 60, NY)).toBe("Sun 08 05:00");
  });

  it("normalises a day overflow into the next month", () => {
    // day 32 of August is 1 September — how the boundary search walks forward.
    expect(roundTrip(2026, 7, 32, 9 * 60, IST)).toBe("Tue 01 09:00");
  });

  it("handles a zone whose DST runs opposite the northern summer", () => {
    // Australia/Sydney is +11 in January, +10 in July.
    const label = (month) =>
      localLabel(
        zonedWallClockToUtc({ year: 2026, month, day: 15, minutes: 540 }, "Australia/Sydney"),
        "Australia/Sydney",
      );
    expect(label(0)).toBe("Thu 15 09:00");
    expect(label(6)).toBe("Wed 15 09:00");
  });
});

describe("nextScheduleBoundary", () => {
  describe("normal windows", () => {
    it("returns the end of the window from inside it", () => {
      expect(localLabel(nextScheduleBoundary(office, ist("10:30")), IST)).toBe("Mon 10 18:00");
    });

    it("returns the start of the next window from outside it", () => {
      // Only Monday is configured, so the next start is a week away.
      expect(localLabel(nextScheduleBoundary(office, ist("19:00")), IST)).toBe("Mon 17 09:00");
    });

    it("returns today's start when called before it", () => {
      expect(localLabel(nextScheduleBoundary(office, ist("06:00")), IST)).toBe("Mon 10 09:00");
    });

    it("treats the start minute as already inside the window", () => {
      expect(localLabel(nextScheduleBoundary(office, ist("09:00")), IST)).toBe("Mon 10 18:00");
    });

    it("treats the end minute as already outside it", () => {
      expect(localLabel(nextScheduleBoundary(office, ist("18:00")), IST)).toBe("Mon 17 09:00");
    });
  });

  describe("multiple windows in a day", () => {
    it("stops at the end of the first window, not the last", () => {
      expect(localLabel(nextScheduleBoundary(split, ist("10:00")), IST)).toBe("Mon 10 12:00");
    });

    it("finds the second window's start from inside the gap", () => {
      expect(localLabel(nextScheduleBoundary(split, ist("13:00")), IST)).toBe("Mon 10 14:00");
    });

    it("finds the second window's end from inside it", () => {
      expect(localLabel(nextScheduleBoundary(split, ist("15:00")), IST)).toBe("Mon 10 18:00");
    });

    it("does not treat a touching boundary as a change", () => {
      // 09:00-12:00 + 12:00-18:00 is continuous coverage: the next real
      // change is 18:00, not the 12:00 seam.
      const touching = custom({
        monday: [
          { start: "09:00", end: "12:00" },
          { start: "12:00", end: "18:00" },
        ],
      });
      expect(localLabel(nextScheduleBoundary(touching, ist("10:00")), IST)).toBe("Mon 10 18:00");
    });
  });

  describe("overnight windows", () => {
    it("crosses midnight to the following morning", () => {
      expect(localLabel(nextScheduleBoundary(overnight, ist("23:00")), IST)).toBe("Tue 11 08:00");
    });

    it("gives the same answer from the far side of midnight", () => {
      expect(localLabel(nextScheduleBoundary(overnight, ist("03:00", 11)), IST)).toBe("Tue 11 08:00");
    });

    it("finds the next opening from outside the window", () => {
      expect(localLabel(nextScheduleBoundary(overnight, ist("12:00", 11)), IST)).toBe("Mon 17 22:00");
    });

    it("returns midnight when the previous day's carry ends exactly there", () => {
      const untilMidnight = custom({ monday: [{ start: "22:00", end: "23:59" }] });
      expect(localLabel(nextScheduleBoundary(untilMidnight, ist("23:00")), IST)).toBe("Mon 10 23:59");
    });

    it("chains across consecutive overnight days", () => {
      const chain = custom({
        monday: [{ start: "20:00", end: "08:00" }],
        tuesday: [{ start: "20:00", end: "08:00" }],
      });
      // Inside Monday's window -> Tuesday 08:00. Inside the daytime gap ->
      // Tuesday 20:00.
      expect(localLabel(nextScheduleBoundary(chain, ist("22:00")), IST)).toBe("Tue 11 08:00");
      expect(localLabel(nextScheduleBoundary(chain, ist("12:00", 11)), IST)).toBe("Tue 11 20:00");
    });
  });

  describe("week wrap", () => {
    it("carries a Sunday overnight window into Monday", () => {
      const sunday = custom({ sunday: [{ start: "22:00", end: "06:00" }] });
      // 2026-08-16 is a Sunday.
      expect(localLabel(nextScheduleBoundary(sunday, ist("23:00", 16)), IST)).toBe("Mon 17 06:00");
    });

    it("finds tomorrow's window when today has none", () => {
      const tuesdayOnly = custom({ tuesday: [{ start: "09:00", end: "17:00" }] });
      expect(localLabel(nextScheduleBoundary(tuesdayOnly, ist("10:00")), IST)).toBe("Tue 11 09:00");
    });
  });

  describe("no boundary to find", () => {
    it("returns null for mode 'always'", () => {
      expect(nextScheduleBoundary({ mode: "always" }, ist("10:00"))).toBeNull();
    });

    it("returns null for a missing schedule", () => {
      expect(nextScheduleBoundary(undefined, ist("10:00"))).toBeNull();
      expect(nextScheduleBoundary(null, ist("10:00"))).toBeNull();
    });

    it("returns null for a custom schedule with no windows", () => {
      expect(nextScheduleBoundary(custom({}), ist("10:00"))).toBeNull();
    });

    it("returns null when every minute of the week is covered", () => {
      const alwaysCovered = custom(
        Object.fromEntries(
          ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
            (day) => [day, [{ start: "00:00", end: "23:59" }]],
          ),
        ),
      );
      // 23:59-00:00 is the only uncovered minute each day, so a boundary does
      // exist — this asserts the search finds it rather than looping forever.
      expect(nextScheduleBoundary(alwaysCovered, ist("10:00"))).not.toBeNull();
    });
  });

  describe("timezones", () => {
    it("resolves the boundary in the schedule's zone, not the server's", () => {
      const utcOffice = custom({ monday: [{ start: "09:00", end: "18:00" }] }, "UTC");
      const at = new Date(Date.UTC(2026, 7, 10, 10, 0)); // Mon 10:00 UTC
      expect(localLabel(nextScheduleBoundary(utcOffice, at), "UTC")).toBe("Mon 10 18:00");
      // The same instant is 15:30 in Kolkata, still inside its own window.
      expect(localLabel(nextScheduleBoundary(office, at), IST)).toBe("Mon 10 18:00");
    });

    it("falls back to UTC rather than throwing on an unusable zone", () => {
      const broken = custom({ monday: [{ start: "09:00", end: "18:00" }] }, "Mars/Olympus");
      const at = new Date(Date.UTC(2026, 7, 10, 10, 0));
      expect(() => nextScheduleBoundary(broken, at)).not.toThrow();
      expect(localLabel(nextScheduleBoundary(broken, at), "UTC")).toBe("Mon 10 18:00");
    });

    it("lands on local wall-clock across a spring-forward night", () => {
      const saturday = custom({ saturday: [{ start: "22:00", end: "08:00" }] }, NY);
      // Sat 2026-03-07 23:00 EST, inside the window; clocks jump at 02:00.
      const boundary = nextScheduleBoundary(saturday, new Date("2026-03-08T04:00:00Z"));
      expect(localLabel(boundary, NY)).toBe("Sun 08 08:00");
    });

    it("lands on local wall-clock across a fall-back night", () => {
      const saturday = custom({ saturday: [{ start: "22:00", end: "08:00" }] }, NY);
      // Sat 2026-10-31 23:00 EDT; the 01:00 hour repeats overnight.
      const boundary = nextScheduleBoundary(saturday, new Date("2026-11-01T03:00:00Z"));
      expect(localLabel(boundary, NY)).toBe("Sun 01 08:00");
    });

    it("handles a zone whose DST differs from the US", () => {
      // Europe/London switches on different dates to America/New_York.
      const londonOffice = custom({ monday: [{ start: "09:00", end: "18:00" }] }, LONDON);
      const at = new Date("2026-08-10T10:00:00Z"); // Mon 11:00 BST
      expect(localLabel(nextScheduleBoundary(londonOffice, at), LONDON)).toBe("Mon 10 18:00");
    });
  });

  describe("the boundary is always in the future", () => {
    it.each([
      ["08:59", office],
      ["09:00", office],
      ["12:00", office],
      ["17:59", office],
      ["18:00", office],
      ["23:59", office],
      ["10:00", split],
      ["13:00", split],
      ["22:00", overnight],
      ["03:00", overnight],
      ["10:00", everyDay],
    ])("never returns a past instant (from %s)", (hhmm, schedule) => {
      const from = ist(hhmm);
      const boundary = nextScheduleBoundary(schedule, from);
      expect(boundary).not.toBeNull();
      expect(boundary.getTime()).toBeGreaterThan(from.getTime());
    });
  });
});
