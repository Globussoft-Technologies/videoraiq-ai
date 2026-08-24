/**
 * Manual override of a schedule-governed detector.
 *
 * The behaviour under test: toggling a detector by hand beats the schedule for
 * the rest of the current window, then lapses so the schedule takes back over
 * without anyone having to undo anything.
 *
 * Before this existed, a manual toggle was indistinguishable from the drift
 * the one-minute runner exists to correct, so the runner reverted it inside a
 * minute — the bug this suite pins down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../core/v1/globalSchedule/globalSchedule.model.js", () => ({
  default: { find: () => ({ lean: async () => [] }) },
}));
vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const {
  SCHEDULE_SOURCE,
  createGlobalScheduleIndex,
  isManualOverrideActive,
  manualOverrideFor,
  resolveDesiredDetectionState,
} = await import("../../../services/detectionSchedule.resolver.js");

const TZ = "Asia/Kolkata";
const NVR_ID = "n1";
const CHANNEL_ID = "c1";
const DETECTOR = "deskAbsenceSettings";

/** Global schedule: office hours on Monday only. 2026-08-10 is a Monday. */
const officeHours = {
  mode: "custom",
  timezone: TZ,
  days: { monday: [{ start: "09:00", end: "18:00" }] },
};

const globalScheduleDoc = {
  _id: "g1",
  enabled: true,
  nvrId: NVR_ID,
  schedule: officeHours,
  cameras: [{ channelId: CHANNEL_ID, enabled: true }],
  detectors: [],
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const index = createGlobalScheduleIndex([globalScheduleDoc]);

/** A camera enrolled in the global schedule, with an optional override. */
const camera = (detection = {}) => ({
  _id: CHANNEL_ID,
  userId: "u1",
  nvrId: NVR_ID,
  detections: { [DETECTOR]: { id: "d1", ...detection } },
});

/** Pin the clock to a wall-clock time in Asia/Kolkata (UTC+5:30). */
const atKolkata = (hhmm, dayOfMonth = 10) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  vi.setSystemTime(new Date(Date.UTC(2026, 7, dayOfMonth, hour - 5, minute - 30, 0)));
};

/**
 * Built from formatToParts rather than format(): ICU builds disagree about
 * the separators between weekday, day and time, and a test should fail on
 * wrong behaviour, not on a punctuation preference.
 */
const localTime = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("weekday")} ${get("day")} ${get("hour")}:${get("minute")}`;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("isManualOverrideActive", () => {
  it("is false when the fields are absent — every pre-feature document", () => {
    atKolkata("10:30");
    expect(isManualOverrideActive({})).toBe(false);
    expect(isManualOverrideActive(undefined)).toBe(false);
    expect(isManualOverrideActive({ overrideState: false })).toBe(false);
  });

  it("is true up to the expiry and false from it", () => {
    atKolkata("10:30");
    const until = new Date(Date.now() + 60_000);
    expect(isManualOverrideActive({ overrideState: false, overrideUntil: until })).toBe(true);

    vi.setSystemTime(new Date(Date.now() + 61_000));
    expect(isManualOverrideActive({ overrideState: false, overrideUntil: until })).toBe(false);
  });

  it("is false for an unparseable expiry rather than throwing", () => {
    atKolkata("10:30");
    expect(isManualOverrideActive({ overrideUntil: "not a date" })).toBe(false);
  });
});

describe("manualOverrideFor", () => {
  it("expires at the end of the current window when switching off mid-window", () => {
    atKolkata("10:30");
    const override = manualOverrideFor(officeHours, false);

    expect(override.overrideState).toBe(false);
    expect(localTime(override.overrideUntil)).toBe("Mon 10 18:00");
  });

  it("expires at the next window start when switching on outside hours", () => {
    atKolkata("20:00");
    const override = manualOverrideFor(officeHours, true);

    expect(override.overrideState).toBe(true);
    // The following Monday — this schedule has no other day configured.
    expect(localTime(override.overrideUntil)).toBe("Mon 17 09:00");
  });

  it("records nothing when the toggle agrees with the schedule", () => {
    // Turning it on during office hours is what the schedule already wants,
    // so there is no conflict worth remembering.
    atKolkata("10:30");
    expect(manualOverrideFor(officeHours, true)).toEqual({
      overrideState: null,
      overrideUntil: null,
    });
  });

  it("records nothing when no schedule governs the detector", () => {
    atKolkata("10:30");
    expect(manualOverrideFor(undefined, false)).toEqual({
      overrideState: null,
      overrideUntil: null,
    });
  });

  it("records nothing for an always-on schedule, which has no boundary to lapse at", () => {
    atKolkata("10:30");
    expect(manualOverrideFor({ mode: "always" }, false)).toEqual({
      overrideState: null,
      overrideUntil: null,
    });
  });

  it("handles an overnight window, expiring at the following morning", () => {
    const overnight = {
      mode: "custom",
      timezone: TZ,
      days: { monday: [{ start: "22:00", end: "08:00" }] },
    };

    atKolkata("23:00");
    const override = manualOverrideFor(overnight, false);
    expect(localTime(override.overrideUntil)).toBe("Tue 11 08:00");

    // Same window, now past midnight — still the same expiry.
    atKolkata("03:00", 11);
    expect(localTime(manualOverrideFor(overnight, false).overrideUntil)).toBe("Tue 11 08:00");
  });
});

describe("the reported scenario: two cameras, one toggled off by hand", () => {
  it("the schedule runs both cameras during office hours", async () => {
    atKolkata("10:30");

    for (const channel of [camera({ enabled: true }), camera({ enabled: true })]) {
      const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });
      expect(desired.active).toBe(true);
      expect(desired.source).toBe(SCHEDULE_SOURCE.GLOBAL);
    }
  });

  it("a manual off is respected instead of reverted on the next tick", async () => {
    atKolkata("10:30");
    const override = manualOverrideFor(officeHours, false);
    const channel = camera({ enabled: false, ...override });

    // One minute later, exactly when the runner would previously have
    // flipped it straight back on.
    atKolkata("10:31");
    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });

    expect(desired.active).toBe(false);
    expect(desired.source).toBe(SCHEDULE_SOURCE.OVERRIDE);
    // The runner compares desired against current and only acts on a
    // difference — equal means it leaves the camera alone.
    expect(desired.active).toBe(channel.detections[DETECTOR].enabled);
  });

  it("holds for the rest of the window, hours later", async () => {
    atKolkata("10:30");
    const channel = camera({ enabled: false, ...manualOverrideFor(officeHours, false) });

    atKolkata("17:59");
    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });
    expect(desired.active).toBe(false);
    expect(desired.source).toBe(SCHEDULE_SOURCE.OVERRIDE);
  });

  it("still reports the schedule that will resume, so the UI can say so", async () => {
    atKolkata("10:30");
    const channel = camera({ enabled: false, ...manualOverrideFor(officeHours, false) });

    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });
    expect(desired.schedule).toEqual(officeHours);
    expect(localTime(desired.overrideUntil)).toBe("Mon 10 18:00");
  });

  it("lapses at the boundary and hands control back to the schedule", async () => {
    atKolkata("10:30");
    const channel = camera({ enabled: false, ...manualOverrideFor(officeHours, false) });

    // Next Monday, inside office hours: the override is long lapsed, so the
    // schedule turns the camera back on with no human intervention.
    atKolkata("09:30", 17);
    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });

    expect(desired.active).toBe(true);
    expect(desired.source).toBe(SCHEDULE_SOURCE.GLOBAL);
    expect(desired.active).not.toBe(channel.detections[DETECTOR].enabled); // runner acts
  });

  it("leaves the other camera untouched — the override is per camera + detector", async () => {
    atKolkata("10:30");
    const overridden = camera({ enabled: false, ...manualOverrideFor(officeHours, false) });
    const untouched = camera({ enabled: true });

    expect((await resolveDesiredDetectionState(overridden, DETECTOR, { index })).active).toBe(false);
    expect((await resolveDesiredDetectionState(untouched, DETECTOR, { index })).active).toBe(true);
  });

  it("a manual ON outside hours survives until the schedule next changes", async () => {
    atKolkata("20:00");
    const channel = camera({ enabled: true, ...manualOverrideFor(officeHours, true) });

    atKolkata("23:00");
    expect((await resolveDesiredDetectionState(channel, DETECTOR, { index })).active).toBe(true);

    // Next Monday 09:00 the schedule wants it on anyway, so nothing changes;
    // by 18:00 the override is gone and the schedule stops it.
    atKolkata("18:30", 17);
    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });
    expect(desired.active).toBe(false);
    expect(desired.source).toBe(SCHEDULE_SOURCE.GLOBAL);
  });
});

describe("backward compatibility", () => {
  it("a camera with no override fields behaves exactly as before", async () => {
    atKolkata("10:30");
    const channel = camera({ enabled: true });
    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });

    expect(desired.active).toBe(true);
    expect(desired.source).toBe(SCHEDULE_SOURCE.GLOBAL);
    expect(desired.overrideUntil).toBeUndefined();
  });

  it("a lapsed override is inert, not sticky", async () => {
    atKolkata("10:30");
    const channel = camera({
      enabled: false,
      overrideState: false,
      overrideUntil: new Date(Date.UTC(2026, 0, 1)),
    });

    const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });
    expect(desired.active).toBe(true);
    expect(desired.source).toBe(SCHEDULE_SOURCE.GLOBAL);
  });
});
