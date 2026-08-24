/**
 * Unit tests for services/detectionSchedule.resolver.js
 *
 * The resolver is the single source of truth shared by the v1 one-minute
 * schedule runner and the v1/v2 save-and-apply paths. What matters here:
 *
 *   1. the priority rule — global schedule beats camera-specific, and with no
 *      global schedule the pre-existing camera-specific behaviour is unchanged
 *   2. the four schedule combinations an admin can actually produce
 *   3. that v1's runner and v2's immediate save arrive at the SAME desired
 *      state, since they are separate call sites into this one function
 *
 * `GlobalSchedule` is mocked so these stay pure unit tests with no database.
 * Times are pinned with fake timers rather than "now", so a test run at 3am
 * asserts the same thing as one at noon.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ docs: [], findError: null }));

vi.mock("../../../core/v1/globalSchedule/globalSchedule.model.js", () => ({
  default: {
    find: () => ({
      lean: async () => {
        if (h.findError) throw h.findError;
        return h.docs;
      },
    }),
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  isScheduleActiveNow,
  resolveEffectiveSchedule,
  resolveDesiredDetectionState,
  createGlobalScheduleIndex,
  buildGlobalScheduleIndex,
  globalScheduleApplies,
  SCHEDULE_SOURCE,
} = await import("../../../services/detectionSchedule.resolver.js");

const NVR_ID = "6500000000000000000000n1".replace("n1", "a1");
const CAMERA_ID = "6500000000000000000000c1";
const OTHER_CAMERA_ID = "6500000000000000000000c2";
const ADMIN_ID = "admin-1";
const DETECTOR = "personalProtectiveEquipmentSettings";

/** 09:00–18:00 Mon–Fri, matching the spec's worked example. */
const officeHours = (timezone = "Asia/Kolkata") => ({
  mode: "custom",
  timezone,
  days: {
    monday: [{ start: "09:00", end: "18:00" }],
    tuesday: [{ start: "09:00", end: "18:00" }],
    wednesday: [{ start: "09:00", end: "18:00" }],
    thursday: [{ start: "09:00", end: "18:00" }],
    friday: [{ start: "09:00", end: "18:00" }],
    saturday: [],
    sunday: [],
  },
});

/** A deliberately different window, so "which schedule won" is observable. */
const nightShift = (timezone = "Asia/Kolkata") => ({
  mode: "custom",
  timezone,
  days: {
    monday: [{ start: "22:00", end: "23:30" }],
    tuesday: [{ start: "22:00", end: "23:30" }],
    wednesday: [{ start: "22:00", end: "23:30" }],
    thursday: [{ start: "22:00", end: "23:30" }],
    friday: [{ start: "22:00", end: "23:30" }],
    saturday: [],
    sunday: [],
  },
});

const makeChannel = (schedule, overrides = {}) => ({
  _id: CAMERA_ID,
  userId: ADMIN_ID,
  nvrId: NVR_ID,
  detections: {
    [DETECTOR]: { id: "detection-setting-1", enabled: false, schedule },
  },
  ...overrides,
});

const makeGlobalSchedule = (schedule, overrides = {}) => ({
  _id: "global-1",
  userId: ADMIN_ID,
  nvrId: NVR_ID,
  enabled: true,
  schedule,
  cameras: [{ channelId: CAMERA_ID, enabled: true }],
  detectors: [],
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

/**
 * Pin the clock to a wall-clock time in Asia/Kolkata (UTC+5:30), the default
 * schedule timezone. 2026-08-12 is a Wednesday.
 */
const atKolkata = (hhmm) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  const utcHour = hour - 5;
  const utcMinute = minute - 30;
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, utcHour, utcMinute, 0)));
};

beforeEach(() => {
  h.docs = [];
  h.findError = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isScheduleActiveNow — extracted verbatim from v1/v2", () => {
  it("treats a missing schedule as always-on (pre-existing default)", () => {
    expect(isScheduleActiveNow(undefined)).toBe(true);
    expect(isScheduleActiveNow(null)).toBe(true);
  });

  it("treats mode 'always' as always-on", () => {
    atKolkata("03:00");
    expect(isScheduleActiveNow({ mode: "always" })).toBe(true);
  });

  it("is active inside a custom window and inactive outside it", () => {
    atKolkata("10:00");
    expect(isScheduleActiveNow(officeHours())).toBe(true);

    atKolkata("20:00");
    expect(isScheduleActiveNow(officeHours())).toBe(false);
  });

  it("is inclusive of start and exclusive of end", () => {
    atKolkata("09:00");
    expect(isScheduleActiveNow(officeHours())).toBe(true);

    atKolkata("18:00");
    expect(isScheduleActiveNow(officeHours())).toBe(false);

    atKolkata("17:59");
    expect(isScheduleActiveNow(officeHours())).toBe(true);
  });

  it("evaluates against the schedule's own timezone, not the server's", () => {
    // 06:00 UTC is 11:30 in Kolkata (inside office hours) but 06:00 in London
    // (outside). One instant, two verdicts — that is the timezone doing work.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 6, 0, 0)));
    expect(isScheduleActiveNow(officeHours("Asia/Kolkata"))).toBe(true);
    expect(isScheduleActiveNow(officeHours("Europe/London"))).toBe(false);
  });

  it("supports multiple ranges in one day", () => {
    const split = {
      mode: "custom",
      timezone: "Asia/Kolkata",
      days: {
        wednesday: [
          { start: "09:00", end: "12:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    };

    atKolkata("10:00");
    expect(isScheduleActiveNow(split)).toBe(true);
    atKolkata("13:00"); // the lunch gap
    expect(isScheduleActiveNow(split)).toBe(false);
    atKolkata("15:00");
    expect(isScheduleActiveNow(split)).toBe(true);
  });

  it("is inactive on a day with no configured ranges", () => {
    // 2026-08-15 is a Saturday, empty in officeHours.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 15, 6, 0, 0)));
    expect(isScheduleActiveNow(officeHours())).toBe(false);
  });
});

/**
 * Overnight ranges through the real evaluator, i.e. with a clock and a
 * timezone rather than the pure (day, minutes) inputs covered in
 * tests/unit/utils/scheduleWindows.test.js.
 */
describe("isScheduleActiveNow — overnight ranges", () => {
  const overnight = (timezone = "Asia/Kolkata") => ({
    mode: "custom",
    timezone,
    days: { wednesday: [{ start: "22:00", end: "08:00" }] },
  });

  /** Pin the clock to a wall-clock time on Thursday 2026-08-13 in Kolkata. */
  const atKolkataThursday = (hhmm) => {
    const [hour, minute] = hhmm.split(":").map(Number);
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, hour - 5, minute - 30, 0)));
  };

  it("is off before the window opens", () => {
    atKolkata("21:59");
    expect(isScheduleActiveNow(overnight())).toBe(false);
  });

  it("turns on at the start and stays on to midnight", () => {
    atKolkata("22:00");
    expect(isScheduleActiveNow(overnight())).toBe(true);
    atKolkata("23:59");
    expect(isScheduleActiveNow(overnight())).toBe(true);
  });

  it("stays on past midnight, on a day with no window of its own", () => {
    // Thursday is empty in this schedule; these minutes belong to Wednesday's
    // range. Before overnight support this returned false.
    atKolkataThursday("00:00");
    expect(isScheduleActiveNow(overnight())).toBe(true);
    atKolkataThursday("07:59");
    expect(isScheduleActiveNow(overnight())).toBe(true);
  });

  it("turns off at the end time on the following day", () => {
    atKolkataThursday("08:00");
    expect(isScheduleActiveNow(overnight())).toBe(false);
    atKolkataThursday("12:00");
    expect(isScheduleActiveNow(overnight())).toBe(false);
  });

  it("combines a normal and an overnight range on the same day", () => {
    const mixed = {
      mode: "custom",
      timezone: "Asia/Kolkata",
      days: {
        wednesday: [
          { start: "09:00", end: "12:00" },
          { start: "22:00", end: "08:00" },
        ],
      },
    };

    atKolkata("10:00");
    expect(isScheduleActiveNow(mixed)).toBe(true);
    atKolkata("13:00");
    expect(isScheduleActiveNow(mixed)).toBe(false);
    atKolkata("23:00");
    expect(isScheduleActiveNow(mixed)).toBe(true);
    atKolkataThursday("03:00");
    expect(isScheduleActiveNow(mixed)).toBe(true);
  });

  it("does not treat start === end as a 24-hour window", () => {
    const zeroLength = {
      mode: "custom",
      timezone: "Asia/Kolkata",
      days: { wednesday: [{ start: "09:00", end: "09:00" }] },
    };

    atKolkata("09:00");
    expect(isScheduleActiveNow(zeroLength)).toBe(false);
    atKolkata("15:00");
    expect(isScheduleActiveNow(zeroLength)).toBe(false);
  });
});

describe("isScheduleActiveNow — overnight ranges across timezones", () => {
  const wednesdayNight = (timezone) => ({
    mode: "custom",
    timezone,
    days: { wednesday: [{ start: "22:00", end: "08:00" }] },
  });

  it("evaluates one instant differently per zone", () => {
    // 18:00Z on Wed 2026-08-12 is Wed 23:30 in Kolkata (inside the window) but
    // Wed 18:00 in UTC (outside it). Same moment, two verdicts.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 18, 0, 0)));
    expect(isScheduleActiveNow(wednesdayNight("Asia/Kolkata"))).toBe(true);
    expect(isScheduleActiveNow(wednesdayNight("UTC"))).toBe(false);
  });

  it("works in UTC itself", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 23, 0, 0))); // Wed 23:00 UTC
    expect(isScheduleActiveNow(wednesdayNight("UTC"))).toBe(true);
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 3, 0, 0))); // Thu 03:00 UTC
    expect(isScheduleActiveNow(wednesdayNight("UTC"))).toBe(true);
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 8, 0, 0))); // Thu 08:00 UTC
    expect(isScheduleActiveNow(wednesdayNight("UTC"))).toBe(false);
  });

  /**
   * DST. The offset changes underneath an overnight range, so anything built
   * on a fixed offset breaks here; Intl resolves the zone per instant, so the
   * wall-clock intent ("22:00 to 08:00, local") survives the transition.
   */
  describe("America/New_York across both 2026 DST transitions", () => {
    const saturdayNight = {
      mode: "custom",
      timezone: "America/New_York",
      days: { saturday: [{ start: "22:00", end: "08:00" }] },
    };

    it("survives clocks going forward (Sun 2026-03-08, 02:00 EST -> 03:00 EDT)", () => {
      // Sat 22:30 EST — window open, offset still -5.
      vi.setSystemTime(new Date("2026-03-08T03:30:00Z"));
      expect(isScheduleActiveNow(saturdayNight)).toBe(true);

      // Sun 05:00 EDT — after the jump, offset now -4, still inside.
      vi.setSystemTime(new Date("2026-03-08T09:00:00Z"));
      expect(isScheduleActiveNow(saturdayNight)).toBe(true);

      // Sun 08:00 EDT — closes on local wall-clock, not on elapsed hours.
      vi.setSystemTime(new Date("2026-03-08T12:00:00Z"));
      expect(isScheduleActiveNow(saturdayNight)).toBe(false);
    });

    it("survives clocks going back (Sun 2026-11-01, 02:00 EDT -> 01:00 EST)", () => {
      // Sat 19:30 EDT — before the window opens.
      vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
      expect(isScheduleActiveNow(saturdayNight)).toBe(false);

      // Sun 06:00 EST — after the repeated hour, still inside.
      vi.setSystemTime(new Date("2026-11-01T11:00:00Z"));
      expect(isScheduleActiveNow(saturdayNight)).toBe(true);

      // Sun 08:00 EST — closed.
      vi.setSystemTime(new Date("2026-11-01T13:00:00Z"));
      expect(isScheduleActiveNow(saturdayNight)).toBe(false);
    });
  });

  it("falls back to the default zone instead of throwing on an unusable one", () => {
    // Rows predating timezone validation may hold a zone Intl rejects. That
    // must not take the one-minute runner's whole sweep down with a RangeError.
    const broken = {
      mode: "custom",
      timezone: "Mars/Olympus",
      days: { wednesday: [{ start: "22:00", end: "08:00" }] },
    };

    atKolkata("23:00"); // 23:00 in the Asia/Kolkata fallback
    expect(() => isScheduleActiveNow(broken)).not.toThrow();
    expect(isScheduleActiveNow(broken)).toBe(true);
  });
});

describe("resolveEffectiveSchedule — the priority rule", () => {
  it("prefers the global schedule when one applies", () => {
    const result = resolveEffectiveSchedule({
      globalSchedule: makeGlobalSchedule(officeHours()),
      cameraSchedule: nightShift(),
    });

    expect(result.source).toBe(SCHEDULE_SOURCE.GLOBAL);
    expect(result.schedule).toEqual(officeHours());
  });

  it("falls back to the camera schedule with no global schedule", () => {
    const result = resolveEffectiveSchedule({
      globalSchedule: null,
      cameraSchedule: nightShift(),
    });

    expect(result.source).toBe(SCHEDULE_SOURCE.CAMERA);
    expect(result.schedule).toEqual(nightShift());
  });

  it("falls back to undefined (always-on) when neither exists", () => {
    const result = resolveEffectiveSchedule({});

    expect(result.source).toBe(SCHEDULE_SOURCE.DEFAULT);
    expect(result.schedule).toBeUndefined();
    expect(isScheduleActiveNow(result.schedule)).toBe(true);
  });

  it("accepts a bare schedule object as the global schedule", () => {
    const result = resolveEffectiveSchedule({
      globalSchedule: officeHours(),
      cameraSchedule: nightShift(),
    });

    expect(result.source).toBe(SCHEDULE_SOURCE.GLOBAL);
    expect(result.schedule).toEqual(officeHours());
  });
});

describe("globalScheduleApplies — scoping", () => {
  const channel = makeChannel(undefined);

  it("applies to a listed, enabled camera on the same NVR", () => {
    expect(globalScheduleApplies(makeGlobalSchedule(officeHours()), channel, DETECTOR)).toBe(true);
  });

  it("does not apply when the schedule is disabled", () => {
    const schedule = makeGlobalSchedule(officeHours(), { enabled: false });
    expect(globalScheduleApplies(schedule, channel, DETECTOR)).toBe(false);
  });

  it("does not apply when the camera is not listed", () => {
    const schedule = makeGlobalSchedule(officeHours(), {
      cameras: [{ channelId: OTHER_CAMERA_ID, enabled: true }],
    });
    expect(globalScheduleApplies(schedule, channel, DETECTOR)).toBe(false);
  });

  it("does not apply when the camera's entry is disabled — removal without deletion", () => {
    const schedule = makeGlobalSchedule(officeHours(), {
      cameras: [{ channelId: CAMERA_ID, enabled: false }],
    });
    expect(globalScheduleApplies(schedule, channel, DETECTOR)).toBe(false);
  });

  it("does not apply across NVRs", () => {
    const schedule = makeGlobalSchedule(officeHours(), { nvrId: "6500000000000000000000b9" });
    expect(globalScheduleApplies(schedule, channel, DETECTOR)).toBe(false);
  });

  it("honours detector scoping, empty meaning all detectors", () => {
    const scoped = makeGlobalSchedule(officeHours(), { detectors: ["lineCrossingSettings"] });
    expect(globalScheduleApplies(scoped, channel, DETECTOR)).toBe(false);
    expect(globalScheduleApplies(scoped, channel, "lineCrossingSettings")).toBe(true);

    const unscoped = makeGlobalSchedule(officeHours());
    expect(globalScheduleApplies(unscoped, channel, DETECTOR)).toBe(true);
  });

  it("matches a populated nvrId document as well as a raw id", () => {
    const populated = makeChannel(undefined, { nvrId: { _id: NVR_ID, name: "NVR-01" } });
    expect(globalScheduleApplies(makeGlobalSchedule(officeHours()), populated, DETECTOR)).toBe(true);
  });
});

describe("global schedule index", () => {
  it("collects covered channel ids, skipping disabled entries and schedules", () => {
    const index = createGlobalScheduleIndex([
      makeGlobalSchedule(officeHours(), {
        cameras: [
          { channelId: CAMERA_ID, enabled: true },
          { channelId: OTHER_CAMERA_ID, enabled: false },
        ],
      }),
      makeGlobalSchedule(officeHours(), { _id: "global-2", enabled: false }),
    ]);

    expect(index.channelIds).toEqual([CAMERA_ID]);
    expect(index.size).toBe(1);
  });

  it("breaks ties deterministically: detector-scoped wins, then newest", () => {
    const catchAll = makeGlobalSchedule(nightShift(), {
      _id: "catch-all",
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    });
    const scoped = makeGlobalSchedule(officeHours(), {
      _id: "scoped",
      detectors: [DETECTOR],
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    // Scoped wins despite being older, and regardless of input order.
    expect(createGlobalScheduleIndex([catchAll, scoped]).find(makeChannel(), DETECTOR)._id).toBe("scoped");
    expect(createGlobalScheduleIndex([scoped, catchAll]).find(makeChannel(), DETECTOR)._id).toBe("scoped");
  });

  it("falls back to an empty index when the query fails, preserving camera-specific behaviour", async () => {
    h.findError = new Error("mongo down");

    const index = await buildGlobalScheduleIndex();

    expect(index.size).toBe(0);
    expect(index.channelIds).toEqual([]);
    expect(index.find(makeChannel(), DETECTOR)).toBeNull();
  });
});

describe("resolveDesiredDetectionState — the four admin-reachable combinations", () => {
  it("case 1: no global schedule + custom camera schedule -> camera schedule decides", async () => {
    h.docs = [];
    const channel = makeChannel(officeHours());

    atKolkata("10:00");
    let desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.CAMERA });

    atKolkata("20:00");
    desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: false, source: SCHEDULE_SOURCE.CAMERA });
  });

  it("case 2: global schedule + camera schedule -> global wins", async () => {
    // Global says office hours, camera says night shift. At 10:00 they
    // disagree, so `active` alone proves which one was used.
    h.docs = [makeGlobalSchedule(officeHours())];
    const channel = makeChannel(nightShift());

    atKolkata("10:00");
    let desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.GLOBAL });

    atKolkata("22:30"); // inside the camera window, outside the global one
    desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: false, source: SCHEDULE_SOURCE.GLOBAL });
  });

  it("case 3: global schedule + camera 'always' -> global wins and can stop the camera", async () => {
    // The headline case: an admin schedules 50 cameras without touching any of
    // them individually. Camera-level "always" must not defeat the global stop.
    h.docs = [makeGlobalSchedule(officeHours())];
    const channel = makeChannel({ mode: "always" });

    atKolkata("10:00");
    let desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.GLOBAL });

    atKolkata("20:00");
    desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: false, source: SCHEDULE_SOURCE.GLOBAL });
  });

  it("case 3b: a camera with no schedule field at all is still governed globally", async () => {
    h.docs = [makeGlobalSchedule(officeHours())];
    const channel = makeChannel(undefined);

    atKolkata("20:00");
    const desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: false, source: SCHEDULE_SOURCE.GLOBAL });
  });

  it("case 4: no global schedule + camera 'always' -> always on, unchanged behaviour", async () => {
    h.docs = [];
    const channel = makeChannel({ mode: "always" });

    for (const time of ["03:00", "10:00", "20:00"]) {
      atKolkata(time);
      const desired = await resolveDesiredDetectionState(channel, DETECTOR);
      expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.CAMERA });
    }
  });

  it("case 4b: neither schedule exists -> always on, unchanged behaviour", async () => {
    h.docs = [];
    const channel = makeChannel(undefined);

    atKolkata("20:00");
    const desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.DEFAULT });
  });

  it("a camera outside the global schedule keeps its own schedule (spec's Camera 04)", async () => {
    // Global covers CAMERA_ID only; this camera is not listed, so it must go on
    // following its camera-specific schedule.
    h.docs = [makeGlobalSchedule(officeHours())];
    const camera04 = makeChannel(nightShift(), { _id: OTHER_CAMERA_ID });

    atKolkata("22:30");
    const desired = await resolveDesiredDetectionState(camera04, DETECTOR);
    expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.CAMERA });
  });

  it("a disabled global schedule reverts the camera to its own schedule", async () => {
    h.docs = [makeGlobalSchedule(officeHours(), { enabled: false })];
    const channel = makeChannel(nightShift());

    atKolkata("22:30");
    const desired = await resolveDesiredDetectionState(channel, DETECTOR);
    expect(desired).toMatchObject({ active: true, source: SCHEDULE_SOURCE.CAMERA });
  });
});

describe("v1 runner and v2 immediate save agree", () => {
  /**
   * v1's runner resolves with a per-tick index; v2's save path resolves with no
   * index and queries per call. Those are the two real call sites, and they
   * must never disagree — otherwise saving a schedule would flip a camera one
   * way and the next tick would flip it back.
   */
  const resolveAsV1Runner = (channel, index) =>
    resolveDesiredDetectionState(channel, DETECTOR, { index });
  const resolveAsV2Save = (channel) => resolveDesiredDetectionState(channel, DETECTOR);

  const scenarios = [
    { name: "no global + custom camera", docs: () => [], camera: () => officeHours() },
    { name: "global + custom camera", docs: () => [makeGlobalSchedule(officeHours())], camera: () => nightShift() },
    { name: "global + camera always", docs: () => [makeGlobalSchedule(officeHours())], camera: () => ({ mode: "always" }) },
    { name: "no global + camera always", docs: () => [], camera: () => ({ mode: "always" }) },
    { name: "global + no camera schedule", docs: () => [makeGlobalSchedule(officeHours())], camera: () => undefined },
    { name: "disabled global + custom camera", docs: () => [makeGlobalSchedule(officeHours(), { enabled: false })], camera: () => nightShift() },
  ];

  for (const scenario of scenarios) {
    it(`${scenario.name}: identical desired state across the day`, async () => {
      h.docs = scenario.docs();
      const channel = makeChannel(scenario.camera());
      const index = createGlobalScheduleIndex(h.docs);

      for (const time of ["03:00", "08:59", "09:00", "12:00", "17:59", "18:00", "22:30"]) {
        atKolkata(time);

        const viaRunner = await resolveAsV1Runner(channel, index);
        const viaSave = await resolveAsV2Save(channel);

        expect(
          { time, ...viaRunner },
          `runner vs save disagreed at ${time}`,
        ).toEqual({ time, ...viaSave });
      }
    });
  }

  it("a preloaded index gives the same answer as a per-call lookup", async () => {
    h.docs = [makeGlobalSchedule(officeHours())];
    const channel = makeChannel(nightShift());
    const index = createGlobalScheduleIndex(h.docs);

    atKolkata("10:00");
    expect(await resolveAsV1Runner(channel, index)).toEqual(await resolveAsV2Save(channel));
  });
});
