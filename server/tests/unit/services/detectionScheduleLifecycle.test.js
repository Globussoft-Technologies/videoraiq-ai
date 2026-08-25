/**
 * Detection scheduling lifecycle — the full decision matrix.
 *
 * The resolver answers one question: "should this camera's detector be running
 * right now, and which schedule decided that?". The one-minute runner then
 * compares that answer to the stored state and only acts on a difference, so
 * these tests assert the ACTION the runner would take, which is the behaviour
 * an operator actually sees.
 *
 * Complements the narrower suites: scheduleWindows covers window semantics,
 * scheduleBoundary covers expiry maths, detectionOverride covers manual holds.
 * This one covers how camera schedules, global schedules, enrolment, detector
 * scoping and overrides interact.
 *
 * 2026-08-10 is a Monday.
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
  manualOverrideFor,
  resolveDesiredDetectionState,
} = await import("../../../services/detectionSchedule.resolver.js");

const TZ = "Asia/Kolkata";
const NVR = "nvr-1";
const OTHER_NVR = "nvr-2";
const CAM_A = "cam-a";
const CAM_B = "cam-b";
const DETECTOR = "deskAbsenceSettings";
const OTHER_DETECTOR = "lineCrossingSettings";

const officeHours = {
  mode: "custom",
  timezone: TZ,
  days: { monday: [{ start: "09:00", end: "18:00" }] },
};
const alwaysOn = { mode: "always", timezone: TZ };
const nightShift = {
  mode: "custom",
  timezone: TZ,
  days: { monday: [{ start: "22:00", end: "08:00" }] },
};

/** Pin the clock to an Asia/Kolkata wall-clock time (UTC+5:30, no DST). */
const at = (hhmm, dayOfMonth = 10) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  vi.setSystemTime(new Date(Date.UTC(2026, 7, dayOfMonth, hour - 5, minute - 30)));
};

const globalSchedule = (overrides = {}) => ({
  _id: "gs-1",
  enabled: true,
  nvrId: NVR,
  schedule: officeHours,
  cameras: [{ channelId: CAM_A, enabled: true }],
  detectors: [],
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const camera = (id, detection = {}, nvrId = NVR) => ({
  _id: id,
  userId: "u1",
  nvrId,
  detections: { [DETECTOR]: { id: "ds-1", ...detection } },
});

/**
 * What the runner would do this tick. It compares desired against the stored
 * `enabled` and acts only on a difference — so "none" is the common case and
 * the one that means "leave the camera alone".
 */
const runnerAction = async (channel, index) => {
  const desired = await resolveDesiredDetectionState(channel, DETECTOR, { index });
  const current = channel.detections[DETECTOR].enabled === true;
  return {
    action: desired.active === current ? "none" : desired.active ? "START" : "STOP",
    source: desired.source,
    desired: desired.active,
  };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/* ────────────────────────────────────────────────────────────────────────── */

describe("a global schedule takes over a camera that was already running", () => {
  // The reported scenario: the camera was started from its own settings with
  // schedule "Always On", so it is running. A global schedule is created later
  // that includes it. Being already active must not stop the global schedule
  // from owning the camera's lifecycle from then on.
  const index = createGlobalScheduleIndex([globalSchedule()]);
  const runningAlwaysOn = () =>
    camera(CAM_A, { enabled: true, schedule: alwaysOn });

  it("leaves it running inside the global window — nothing to do", async () => {
    at("10:00");
    expect(await runnerAction(runningAlwaysOn(), index)).toMatchObject({
      action: "none",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("STOPS it at the global close time, despite the camera saying Always On", async () => {
    at("18:00");
    expect(await runnerAction(runningAlwaysOn(), index)).toMatchObject({
      action: "STOP",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("keeps it stopped after close", async () => {
    at("20:00");
    const stopped = camera(CAM_A, { enabled: false, schedule: alwaysOn });
    expect(await runnerAction(stopped, index)).toMatchObject({ action: "none" });
  });

  it("STARTS it again at the next global start time", async () => {
    at("09:00", 17); // the following Monday
    const stopped = camera(CAM_A, { enabled: false, schedule: alwaysOn });
    expect(await runnerAction(stopped, index)).toMatchObject({
      action: "START",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("STOPS it before the window opens, since Always On no longer decides", async () => {
    at("08:30");
    expect(await runnerAction(runningAlwaysOn(), index)).toMatchObject({
      action: "STOP",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("walks a full day correctly", async () => {
    const walk = [
      ["06:00", false],
      ["08:59", false],
      ["09:00", true],
      ["13:00", true],
      ["17:59", true],
      ["18:00", false],
      ["23:59", false],
    ];

    for (const [hhmm, expected] of walk) {
      at(hhmm);
      const { desired, source } = await runnerAction(runningAlwaysOn(), index);
      expect({ hhmm, desired, source }).toEqual({
        hhmm,
        desired: expected,
        source: SCHEDULE_SOURCE.GLOBAL,
      });
    }
  });
});

describe("schedule priority", () => {
  it("global beats a camera-specific custom schedule", async () => {
    // The camera wants 20:00-23:00; the global schedule wants 09:00-18:00.
    const cameraSchedule = {
      mode: "custom",
      timezone: TZ,
      days: { monday: [{ start: "20:00", end: "23:00" }] },
    };
    const index = createGlobalScheduleIndex([globalSchedule()]);
    const channel = camera(CAM_A, { enabled: false, schedule: cameraSchedule });

    at("10:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "START",
      source: SCHEDULE_SOURCE.GLOBAL,
    });

    at("21:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "none",
      desired: false,
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("the camera schedule decides when no global schedule applies", async () => {
    const index = createGlobalScheduleIndex([]);
    const channel = camera(CAM_A, { enabled: false, schedule: officeHours });

    at("10:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "START",
      source: SCHEDULE_SOURCE.CAMERA,
    });
  });

  it("no schedule at all means always on — the pre-existing default", async () => {
    const index = createGlobalScheduleIndex([]);
    const channel = camera(CAM_A, { enabled: false });

    at("03:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "START",
      source: SCHEDULE_SOURCE.DEFAULT,
      desired: true,
    });
  });
});

describe("when a global schedule stops applying, the camera reverts", () => {
  const cameraNightOnly = () =>
    camera(CAM_A, {
      enabled: true,
      schedule: { mode: "custom", timezone: TZ, days: { monday: [{ start: "20:00", end: "23:00" }] } },
    });

  it("a disabled global schedule hands control back", async () => {
    const index = createGlobalScheduleIndex([globalSchedule({ enabled: false })]);
    at("10:00");
    // The camera's own schedule says off at 10:00, so it is stopped.
    expect(await runnerAction(cameraNightOnly(), index)).toMatchObject({
      action: "STOP",
      source: SCHEDULE_SOURCE.CAMERA,
    });
  });

  it("un-enrolling the camera hands control back without deleting the row", async () => {
    const index = createGlobalScheduleIndex([
      globalSchedule({ cameras: [{ channelId: CAM_A, enabled: false }] }),
    ]);
    at("10:00");
    expect(await runnerAction(cameraNightOnly(), index)).toMatchObject({
      source: SCHEDULE_SOURCE.CAMERA,
    });
  });

  it("a camera on another NVR is unaffected", async () => {
    const index = createGlobalScheduleIndex([globalSchedule()]);
    const channel = camera(CAM_A, { enabled: true, schedule: alwaysOn }, OTHER_NVR);
    at("20:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "none",
      source: SCHEDULE_SOURCE.CAMERA,
      desired: true,
    });
  });

  it("a camera not listed at all is unaffected", async () => {
    const index = createGlobalScheduleIndex([globalSchedule()]);
    const channel = camera(CAM_B, { enabled: true, schedule: alwaysOn });
    at("20:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      source: SCHEDULE_SOURCE.CAMERA,
    });
  });
});

describe("detector scoping", () => {
  it("an empty detectors list governs every detector", async () => {
    const index = createGlobalScheduleIndex([globalSchedule({ detectors: [] })]);
    at("20:00");
    expect(await runnerAction(camera(CAM_A, { enabled: true }), index)).toMatchObject({
      action: "STOP",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("a scoped schedule governs only the detectors it names", async () => {
    const index = createGlobalScheduleIndex([globalSchedule({ detectors: [DETECTOR] })]);
    at("20:00");
    expect(await runnerAction(camera(CAM_A, { enabled: true }), index)).toMatchObject({
      action: "STOP",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("a detector outside the scope keeps its own schedule — the enrolment gotcha", async () => {
    // Enrolling the camera is NOT enough when the schedule is detector-scoped:
    // a detector left out falls back to its camera schedule and keeps running.
    const index = createGlobalScheduleIndex([
      globalSchedule({ detectors: [OTHER_DETECTOR] }),
    ]);
    const channel = camera(CAM_A, { enabled: true, schedule: alwaysOn });

    at("20:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "none",
      desired: true,
      source: SCHEDULE_SOURCE.CAMERA,
    });
  });

  it("picks the detector-scoped schedule over the catch-all", async () => {
    const catchAll = globalSchedule({ _id: "gs-all", detectors: [] });
    const scoped = globalSchedule({
      _id: "gs-scoped",
      detectors: [DETECTOR],
      schedule: { mode: "custom", timezone: TZ, days: { monday: [{ start: "19:00", end: "23:00" }] } },
    });
    const index = createGlobalScheduleIndex([catchAll, scoped]);

    // 20:00 is outside the catch-all (09:00-18:00) but inside the scoped one.
    at("20:00");
    expect(await runnerAction(camera(CAM_A, { enabled: false }), index)).toMatchObject({
      action: "START",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });
});

describe("overnight global schedules", () => {
  const index = createGlobalScheduleIndex([globalSchedule({ schedule: nightShift })]);

  it.each([
    ["21:59", 10, false],
    ["22:00", 10, true],
    ["23:59", 10, true],
    ["00:00", 11, true],
    ["07:59", 11, true],
    ["08:00", 11, false],
    ["12:00", 11, false],
  ])("Mon 22:00-08:00 at %s (day %i) -> running=%s", async (hhmm, day, expected) => {
    at(hhmm, day);
    const { desired, source } = await runnerAction(camera(CAM_A, { enabled: false }), index);
    expect(desired).toBe(expected);
    expect(source).toBe(SCHEDULE_SOURCE.GLOBAL);
  });

  it("STOPS a camera left running past the overnight close", async () => {
    at("08:00", 11);
    expect(await runnerAction(camera(CAM_A, { enabled: true, schedule: alwaysOn }), index))
      .toMatchObject({ action: "STOP", source: SCHEDULE_SOURCE.GLOBAL });
  });

  it("STARTS a stopped camera when the overnight window opens", async () => {
    at("22:00");
    expect(await runnerAction(camera(CAM_A, { enabled: false }), index))
      .toMatchObject({ action: "START", source: SCHEDULE_SOURCE.GLOBAL });
  });
});

describe("manual override against a global schedule", () => {
  const index = createGlobalScheduleIndex([globalSchedule()]);

  it("holds an operator's stop for the rest of the window", async () => {
    at("10:00");
    const override = manualOverrideFor(officeHours, false);
    const channel = camera(CAM_A, { enabled: false, schedule: alwaysOn, ...override });

    at("14:00");
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "none",
      source: SCHEDULE_SOURCE.OVERRIDE,
      desired: false,
    });
  });

  it("hands control back once the override lapses", async () => {
    at("10:00");
    const channel = camera(CAM_A, {
      enabled: false,
      schedule: alwaysOn,
      ...manualOverrideFor(officeHours, false),
    });

    at("09:30", 17); // next Monday, override long lapsed
    expect(await runnerAction(channel, index)).toMatchObject({
      action: "START",
      source: SCHEDULE_SOURCE.GLOBAL,
    });
  });

  it("does not leak to another camera on the same schedule", async () => {
    at("10:00");
    const overridden = camera(CAM_A, {
      enabled: false,
      ...manualOverrideFor(officeHours, false),
    });
    const untouched = { ...camera(CAM_B, { enabled: true }), _id: CAM_A };

    expect((await runnerAction(overridden, index)).desired).toBe(false);
    expect((await runnerAction(untouched, index)).desired).toBe(true);
  });
});

describe("multiple cameras on one schedule move together", () => {
  it("stops every enrolled camera at the close time", async () => {
    const index = createGlobalScheduleIndex([
      globalSchedule({
        cameras: [
          { channelId: CAM_A, enabled: true },
          { channelId: CAM_B, enabled: true },
        ],
      }),
    ]);

    at("18:00");
    for (const id of [CAM_A, CAM_B]) {
      expect(await runnerAction(camera(id, { enabled: true, schedule: alwaysOn }), index))
        .toMatchObject({ action: "STOP", source: SCHEDULE_SOURCE.GLOBAL });
    }
  });

  it("starts every enrolled camera at the open time", async () => {
    const index = createGlobalScheduleIndex([
      globalSchedule({
        cameras: [
          { channelId: CAM_A, enabled: true },
          { channelId: CAM_B, enabled: true },
        ],
      }),
    ]);

    at("09:00");
    for (const id of [CAM_A, CAM_B]) {
      expect(await runnerAction(camera(id, { enabled: false }), index))
        .toMatchObject({ action: "START", source: SCHEDULE_SOURCE.GLOBAL });
    }
  });
});

describe("idempotence — a settled camera is never touched again", () => {
  const index = createGlobalScheduleIndex([globalSchedule()]);

  it.each([
    ["inside the window, already running", "10:00", true],
    ["outside the window, already stopped", "20:00", false],
  ])("%s -> no action", async (_label, hhmm, enabled) => {
    at(hhmm);
    // Repeated ticks must keep answering "none", or the runner would hammer
    // the DS endpoints every minute.
    for (let tick = 0; tick < 3; tick += 1) {
      expect((await runnerAction(camera(CAM_A, { enabled }), index)).action).toBe("none");
    }
  });
});

describe("full start/stop/start cycle, applying each action as the runner would", () => {
  /**
   * The suites above check one instant at a time with a fixed stored state.
   * This one carries the state forward: whatever the runner decides is
   * written back, so a wrong decision poisons every later tick. That is what
   * catches a camera that stops once and never restarts, or one that flaps.
   */
  const simulate = async ({ schedule, index, startEnabled, ticks }) => {
    const channel = camera(CAM_A, { enabled: startEnabled, schedule });
    const transitions = [];

    for (const [hhmm, day] of ticks) {
      at(hhmm, day);
      const { action } = await runnerAction(channel, index);
      if (action !== "none") {
        channel.detections[DETECTOR].enabled = action === "START";
        transitions.push(`${action} @ day${day} ${hhmm}`);
      }
    }

    return { transitions, finalState: channel.detections[DETECTOR].enabled };
  };

  /** Every hour of a day, as the runner would sweep it. */
  const hourlyTicks = (day) =>
    Array.from({ length: 24 }, (_, hour) => [`${String(hour).padStart(2, "0")}:00`, day]);

  it("takes over a camera left running by Always On, then cycles it daily", async () => {
    const index = createGlobalScheduleIndex([globalSchedule()]);

    // Monday 10, Tuesday 11 (no window), then the following Monday 17.
    const { transitions, finalState } = await simulate({
      schedule: alwaysOn,
      index,
      startEnabled: true, // already running when the global schedule appears
      ticks: [...hourlyTicks(10), ...hourlyTicks(11), ...hourlyTicks(17)],
    });

    expect(transitions).toEqual([
      "STOP @ day10 00:00",  // before the window opens, Always On no longer decides
      "START @ day10 09:00", // global open
      "STOP @ day10 18:00",  // global close — the originally reported failure
      "START @ day17 09:00", // next open, a week later
      "STOP @ day17 18:00",
    ]);
    expect(finalState).toBe(false);
  });

  it("cycles a camera that starts out stopped", async () => {
    const index = createGlobalScheduleIndex([globalSchedule()]);

    const { transitions, finalState } = await simulate({
      schedule: undefined,
      index,
      startEnabled: false,
      ticks: hourlyTicks(10),
    });

    expect(transitions).toEqual(["START @ day10 09:00", "STOP @ day10 18:00"]);
    expect(finalState).toBe(false);
  });

  it("cycles an overnight window across the midnight boundary", async () => {
    const index = createGlobalScheduleIndex([globalSchedule({ schedule: nightShift })]);

    const { transitions, finalState } = await simulate({
      schedule: alwaysOn,
      index,
      startEnabled: true,
      ticks: [...hourlyTicks(10), ...hourlyTicks(11)],
    });

    // Runs 22:00 Monday straight through to 08:00 Tuesday with no stop at
    // midnight, then stays off for the rest of Tuesday.
    expect(transitions).toEqual([
      "STOP @ day10 00:00",
      "START @ day10 22:00",
      "STOP @ day11 08:00",
    ]);
    expect(finalState).toBe(false);
  });

  it("never flaps — no more than one transition per boundary", async () => {
    const index = createGlobalScheduleIndex([globalSchedule()]);

    // Tick every 10 minutes for a full day: 144 evaluations, still exactly
    // two state changes. Anything more means the runner is fighting itself
    // and hammering the DS endpoints.
    const ticks = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of ["00", "10", "20", "30", "40", "50"]) {
        ticks.push([`${String(hour).padStart(2, "0")}:${minute}`, 10]);
      }
    }

    const { transitions } = await simulate({
      schedule: undefined,
      index,
      startEnabled: false,
      ticks,
    });

    expect(transitions).toEqual(["START @ day10 09:00", "STOP @ day10 18:00"]);
  });

  it("resumes the cycle after a manual override lapses", async () => {
    const index = createGlobalScheduleIndex([globalSchedule()]);

    // Operator stops the camera at 10:00 on Monday; the override lasts until
    // 18:00, which is when the schedule would have stopped it anyway. The
    // following Monday must still start it.
    at("10:00");
    const channel = camera(CAM_A, {
      enabled: false,
      schedule: alwaysOn,
      ...manualOverrideFor(officeHours, false),
    });

    const transitions = [];
    for (const [hhmm, day] of [...hourlyTicks(10).slice(10), ...hourlyTicks(17)]) {
      at(hhmm, day);
      const { action } = await runnerAction(channel, index);
      if (action !== "none") {
        channel.detections[DETECTOR].enabled = action === "START";
        transitions.push(`${action} @ day${day} ${hhmm}`);
      }
    }

    // Nothing on Monday — the override held, and by the time it lapsed the
    // schedule agreed. Normal cycling resumes the next Monday.
    expect(transitions).toEqual(["START @ day17 09:00", "STOP @ day17 18:00"]);
  });
});
