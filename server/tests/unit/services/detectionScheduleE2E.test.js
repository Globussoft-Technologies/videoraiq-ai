/**
 * End-to-end scheduling flow, using the configuration reported from testing:
 * NVR 1, Asia/Kolkata, Custom mode, Tuesday 07:08 -> 19:20, several cameras
 * enrolled, one of them carrying two detections.
 *
 * The flow under test, in order:
 *   already ON -> global start -> global close -> next global start
 * plus manual ON/OFF, a camera-specific schedule, and the global override.
 *
 * State is carried forward between ticks, so a wrong decision at one boundary
 * poisons every later one — which is what catches "stopped early" and "never
 * came back".
 *
 * 2026-08-25 is a Tuesday.
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
  cameraCanBulkToggle,
  cameraDetectorTargetStates,
  createGlobalScheduleIndex,
  manualOverrideFor,
  resolveDesiredDetectionState,
} = await import("../../../services/detectionSchedule.resolver.js");

const TZ = "Asia/Kolkata";
const NVR = "nvr-1";
const INTRUSION = "unauthorizedAccessSettings";
const CROWD = "crowdDetectionSettings";
const PPE = "personalProtectiveEquipmentSettings";

/** Exactly what the screenshot shows: Tuesday 07:08 to 19:20, Asia/Kolkata. */
const reportedSchedule = {
  mode: "custom",
  timezone: TZ,
  days: { tuesday: [{ start: "07:08", end: "19:20" }] },
};

const alwaysOn = { mode: "always", timezone: TZ };

/** Pin to an Asia/Kolkata wall-clock time. Day 25 = Tuesday, 26 = Wednesday. */
const ist = (hhmm, dayOfMonth = 25) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  vi.setSystemTime(new Date(Date.UTC(2026, 7, dayOfMonth, hour - 5, minute - 30)));
};

const cam = (id, detections) => ({
  _id: id,
  userId: "u1",
  nvrId: NVR,
  detections: Object.fromEntries(
    Object.entries(detections).map(([type, entry]) => [type, { id: `ds-${id}-${type}`, ...entry }]),
  ),
});

const indexFor = (cameraIds, detectors = []) =>
  createGlobalScheduleIndex([
    {
      _id: "gs-1",
      enabled: true,
      nvrId: NVR,
      schedule: reportedSchedule,
      cameras: cameraIds.map((channelId) => ({ channelId, enabled: true })),
      detectors,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]);

/** One runner tick over one detector: decide, then write the decision back. */
const tick = async (channel, settingType, index) => {
  const entry = channel.detections[settingType];
  const governed = Boolean(entry?.schedule) || Boolean(index.find(channel, settingType));
  if (!governed) return "none";

  const desired = await resolveDesiredDetectionState(channel, settingType, { index });
  const current = entry.enabled === true;
  if (desired.active === current) return "none";

  entry.enabled = desired.active;
  return desired.active ? "START" : "STOP";
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/* ────────────────────────────────────────────────────────────────────────── */

describe("issue 1: detection must not close before its configured end time", () => {
  const index = indexFor(["cam-1"]);

  it.each([
    ["07:07", 25, false],
    ["07:08", 25, true],
    ["12:00", 25, true],
    ["18:00", 25, true], // an hour that looks like a close time but is not
    ["19:07", 25, true],
    ["19:19", 25, true], // last covered minute
    ["19:20", 25, false], // configured close, exclusive
    ["23:59", 25, false],
    ["10:00", 26, false], // Wednesday has no window
  ])("Tue 07:08-19:20 at %s (day %i) -> running=%s", async (hhmm, day, expected) => {
    ist(hhmm, day);
    const channel = cam("cam-1", { [INTRUSION]: { enabled: false } });
    const desired = await resolveDesiredDetectionState(channel, INTRUSION, { index });
    expect(desired.active).toBe(expected);
  });

  it("stays on through every minute of the last hour before close", async () => {
    const channel = cam("cam-1", { [INTRUSION]: { enabled: true } });

    for (let minute = 0; minute < 20; minute += 1) {
      ist(`19:${String(minute).padStart(2, "0")}`);
      expect(await tick(channel, INTRUSION, index)).toBe("none");
      expect(channel.detections[INTRUSION].enabled).toBe(true);
    }

    ist("19:20");
    expect(await tick(channel, INTRUSION, index)).toBe("STOP");
  });
});

describe("issue 2: already-ON camera added to a global schedule", () => {
  const index = indexFor(["cam-1"]);

  it("start time does not restart an already-running detection", async () => {
    // Running from its own Always On settings before the schedule existed.
    const channel = cam("cam-1", { [INTRUSION]: { enabled: true, schedule: alwaysOn } });

    ist("07:08");
    expect(await tick(channel, INTRUSION, index)).toBe("none");
    expect(channel.detections[INTRUSION].enabled).toBe(true);
  });

  it("close time DOES stop it, even though Always On says otherwise", async () => {
    const channel = cam("cam-1", { [INTRUSION]: { enabled: true, schedule: alwaysOn } });

    ist("19:20");
    expect(await tick(channel, INTRUSION, index)).toBe("STOP");
    expect(channel.detections[INTRUSION].enabled).toBe(false);
  });

  it("completes the full cycle: already ON -> close -> next start", async () => {
    const channel = cam("cam-1", { [INTRUSION]: { enabled: true, schedule: alwaysOn } });
    const log = [];

    const ticks = [
      ["07:08", 25], ["12:00", 25], ["19:19", 25], ["19:20", 25], ["23:00", 25],
      ["06:00", 26], ["12:00", 26],           // Wednesday, no window
      ["07:07", 1], ["07:08", 1], ["19:20", 1], // 2026-09-01 is the next Tuesday
    ];

    for (const [hhmm, day] of ticks) {
      // September for the single-digit days above.
      const [hour, minute] = hhmm.split(":").map(Number);
      const month = day < 10 ? 8 : 7;
      vi.setSystemTime(new Date(Date.UTC(2026, month, day, hour - 5, minute - 30)));

      const action = await tick(channel, INTRUSION, index);
      if (action !== "none") log.push(`${action} @ ${day < 10 ? "Sep" : "Aug"} ${day} ${hhmm}`);
    }

    expect(log).toEqual([
      "STOP @ Aug 25 19:20",  // global close beats Always On
      "START @ Sep 1 07:08",  // next Tuesday's open
      "STOP @ Sep 1 19:20",
    ]);
  });
});

describe("multi-detection camera: one closing must not take the others down", () => {
  it("refuses a whole-camera batch while a sibling should still run", async () => {
    // The schedule covers only intrusion; PPE runs from the camera's own
    // Always On settings. This is the shape that was stopping early.
    const index = indexFor(["cam-1"], [INTRUSION]);
    const channel = cam("cam-1", {
      [INTRUSION]: { enabled: true },
      [PPE]: { enabled: true, schedule: alwaysOn },
    });

    ist("19:20");
    const targets = await cameraDetectorTargetStates(channel, { index });
    expect(targets.filter(Boolean)).toHaveLength(1); // PPE still wants to run
    expect(cameraCanBulkToggle(targets, "stop")).toBe(false);
  });

  it("allows the batch once every detector on the camera is closing", async () => {
    const index = indexFor(["cam-1"]); // covers all detectors
    const channel = cam("cam-1", {
      [INTRUSION]: { enabled: true },
      [PPE]: { enabled: true },
    });

    ist("19:20");
    const targets = await cameraDetectorTargetStates(channel, { index });
    expect(cameraCanBulkToggle(targets, "stop")).toBe(true);
  });

  it("keeps the sibling running for the whole day", async () => {
    const index = indexFor(["cam-1"], [INTRUSION]);
    const channel = cam("cam-1", {
      [INTRUSION]: { enabled: true },
      [PPE]: { enabled: true, schedule: alwaysOn },
    });

    for (const hhmm of ["07:00", "07:08", "12:00", "19:19", "19:20", "22:00"]) {
      ist(hhmm);
      await tick(channel, INTRUSION, index);
      await tick(channel, PPE, index);
      expect({ hhmm, ppe: channel.detections[PPE].enabled }).toEqual({ hhmm, ppe: true });
    }
  });
});

describe("several cameras on one schedule move independently but together", () => {
  const index = indexFor(["cam-1", "cam-2", "cam-3"]);

  it("all enrolled cameras stop at the close time", async () => {
    const cameras = [
      cam("cam-1", { [INTRUSION]: { enabled: true } }),
      cam("cam-2", { [CROWD]: { enabled: true } }),
      cam("cam-3", { [PPE]: { enabled: true } }),
    ];
    const detectors = [INTRUSION, CROWD, PPE];

    ist("19:20");
    for (const [i, channel] of cameras.entries()) {
      expect(await tick(channel, detectors[i], index)).toBe("STOP");
    }
  });

  it("a camera left out of the schedule is untouched", async () => {
    const outside = cam("cam-9", { [PPE]: { enabled: true, schedule: alwaysOn } });
    ist("19:20");
    expect(await tick(outside, PPE, index)).toBe("none");
    expect(outside.detections[PPE].enabled).toBe(true);
  });
});

describe("manual ON/OFF against the global schedule", () => {
  const index = indexFor(["cam-1"]);

  it("a manual OFF mid-window holds until the configured close, then lapses", async () => {
    ist("12:00");
    const override = manualOverrideFor(reportedSchedule, false);
    const channel = cam("cam-1", { [INTRUSION]: { enabled: false, ...override } });

    // Held for the rest of the window rather than reverted on the next tick.
    for (const hhmm of ["12:01", "15:00", "19:19"]) {
      ist(hhmm);
      const desired = await resolveDesiredDetectionState(channel, INTRUSION, { index });
      expect({ hhmm, active: desired.active, source: desired.source }).toEqual({
        hhmm,
        active: false,
        source: SCHEDULE_SOURCE.OVERRIDE,
      });
    }

    // Lapses exactly at the configured close, where the schedule agrees anyway.
    ist("19:20");
    const after = await resolveDesiredDetectionState(channel, INTRUSION, { index });
    expect(after.active).toBe(false);
    expect(after.source).toBe(SCHEDULE_SOURCE.GLOBAL);
  });

  it("the override expires at the schedule's own close time, not some other time", () => {
    ist("12:00");
    const { overrideUntil } = manualOverrideFor(reportedSchedule, false);
    const label = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(overrideUntil);
    expect(label).toBe("19:20");
  });
});

describe("camera-specific schedule alongside the global one", () => {
  it("the global schedule wins while it applies", async () => {
    const index = indexFor(["cam-1"]);
    const channel = cam("cam-1", {
      [INTRUSION]: {
        enabled: false,
        // Camera wants 20:00-23:00; global wants 07:08-19:20.
        schedule: { mode: "custom", timezone: TZ, days: { tuesday: [{ start: "20:00", end: "23:00" }] } },
      },
    });

    ist("12:00");
    expect((await resolveDesiredDetectionState(channel, INTRUSION, { index })).source).toBe(
      SCHEDULE_SOURCE.GLOBAL,
    );

    ist("21:00");
    const evening = await resolveDesiredDetectionState(channel, INTRUSION, { index });
    expect(evening.active).toBe(false); // global says closed, and it outranks
    expect(evening.source).toBe(SCHEDULE_SOURCE.GLOBAL);
  });

  it("the camera schedule takes back over when the global one is disabled", async () => {
    const disabled = createGlobalScheduleIndex([
      {
        _id: "gs-1",
        enabled: false,
        nvrId: NVR,
        schedule: reportedSchedule,
        cameras: [{ channelId: "cam-1", enabled: true }],
        detectors: [],
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    const channel = cam("cam-1", {
      [INTRUSION]: {
        enabled: false,
        schedule: { mode: "custom", timezone: TZ, days: { tuesday: [{ start: "20:00", end: "23:00" }] } },
      },
    });

    ist("21:00");
    const desired = await resolveDesiredDetectionState(channel, INTRUSION, { index: disabled });
    expect(desired.active).toBe(true);
    expect(desired.source).toBe(SCHEDULE_SOURCE.CAMERA);
  });
});
