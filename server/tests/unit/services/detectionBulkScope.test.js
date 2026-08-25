/**
 * Bulk-vs-per-detector routing for schedule transitions.
 *
 * The DS bulk endpoints take camera ids and act on EVERY detector on the
 * camera — the payload carries no detector scope. So a camera may only be put
 * in a batch when every detector configured on it is meant to end up in the
 * state that batch is moving to.
 *
 * The bug this pins down, reported from testing: a camera with several
 * detections, one governed by a global schedule and another left running from
 * its own settings. When the global window closed, the batch stopped the whole
 * camera, killing the second detection early. Worse, only the detector that
 * triggered the batch had its stored `enabled` written back, so the other one
 * stayed marked running while its pipeline was dead — and the runner never
 * corrected it, because stored and desired already agreed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../core/v1/globalSchedule/globalSchedule.model.js", () => ({
  default: { find: () => ({ lean: async () => [] }) },
}));
vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const {
  cameraCanBulkToggle,
  cameraDetectorTargetStates,
  createGlobalScheduleIndex,
} = await import("../../../services/detectionSchedule.resolver.js");

const TZ = "Asia/Kolkata";
const NVR = "nvr-1";
const CAM = "cam-1";
const DESK = "deskAbsenceSettings";
const LINE = "lineCrossingSettings";
const PPE = "personalProtectiveEquipmentSettings";

const officeHours = {
  mode: "custom",
  timezone: TZ,
  days: { monday: [{ start: "09:00", end: "18:00" }] },
};
const eveningShift = {
  mode: "custom",
  timezone: TZ,
  days: { monday: [{ start: "14:00", end: "22:00" }] },
};
const alwaysOn = { mode: "always", timezone: TZ };

const at = (hhmm, dayOfMonth = 10) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  vi.setSystemTime(new Date(Date.UTC(2026, 7, dayOfMonth, hour - 5, minute - 30)));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("cameraCanBulkToggle", () => {
  it("allows a stop batch when every detector should end up stopped", () => {
    expect(cameraCanBulkToggle([false, false, false], "stop")).toBe(true);
  });

  it("NEVER batches a resume, even when every detector should end up running", () => {
    // /stream/resume-all carries no stream url, detectors, zones or
    // thresholds, so it can only un-pause a pipeline DS already holds.
    // Starting always goes through the per-detector POST /stream instead,
    // which sends the full configuration — otherwise a camera reports
    // enabled while no detections actually fire.
    expect(cameraCanBulkToggle([true, true], "resume")).toBe(false);
    expect(cameraCanBulkToggle([true], "resume")).toBe(false);
  });

  it("refuses a stop batch when any detector should stay running", () => {
    // The reported bug in one line: batching here stops the running detector too.
    expect(cameraCanBulkToggle([false, true], "stop")).toBe(false);
  });

  it("refuses a resume batch when any detector should stay stopped", () => {
    expect(cameraCanBulkToggle([true, false], "resume")).toBe(false);
  });

  it("refuses a stop batch whose direction is the opposite of every target", () => {
    expect(cameraCanBulkToggle([true, true], "stop")).toBe(false);
  });

  it("refuses an unrecognised operation", () => {
    expect(cameraCanBulkToggle([false, false], "pause")).toBe(false);
    expect(cameraCanBulkToggle([false, false], undefined)).toBe(false);
  });

  it("handles a single-detector camera, the common case", () => {
    expect(cameraCanBulkToggle([false], "stop")).toBe(true);
    expect(cameraCanBulkToggle([true], "stop")).toBe(false);
  });

  it("refuses when there is nothing to reason about", () => {
    expect(cameraCanBulkToggle([], "stop")).toBe(false);
    expect(cameraCanBulkToggle(undefined, "stop")).toBe(false);
    expect(cameraCanBulkToggle(null, "resume")).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("routing a real multi-detection camera", () => {
  const globalCovering = (detectors) => ({
    _id: "gs-1",
    enabled: true,
    nvrId: NVR,
    schedule: officeHours,
    cameras: [{ channelId: CAM, enabled: true }],
    detectors,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const camera = (detections) => ({
    _id: CAM,
    userId: "u1",
    nvrId: NVR,
    detections: Object.fromEntries(
      Object.entries(detections).map(([type, entry]) => [type, { id: `ds-${type}`, ...entry }]),
    ),
  });

  /**
   * Calls the SHIPPED helper rather than re-implementing it, so this suite
   * fails if production logic drifts — a mirror would happily agree with itself.
   */
  const routeFor = async (channel, index, operation) => {
    const targetStates = await cameraDetectorTargetStates(channel, { index });
    return { targetStates, bulk: cameraCanBulkToggle(targetStates, operation) };
  };

  /**
   * The helper walks DETECTION_TYPES order, not the order a test declares its
   * detections, so positional assertions would be testing that ordering rather
   * than the behaviour. Compare as a multiset instead.
   */
  const sorted = (states) => [...states].sort();

  it("batches a camera whose only detector is closing", async () => {
    const index = createGlobalScheduleIndex([globalCovering([])]);
    const channel = camera({ [DESK]: { enabled: true } });

    at("18:00");
    expect(await routeFor(channel, index, "stop")).toMatchObject({
      targetStates: [false],
      bulk: true,
    });
  });

  it("batches a camera whose detectors all close together", async () => {
    const index = createGlobalScheduleIndex([globalCovering([])]);
    const channel = camera({
      [DESK]: { enabled: true },
      [LINE]: { enabled: true },
      [PPE]: { enabled: true },
    });

    at("18:00");
    const route = await routeFor(channel, index, "stop");
    expect(route.targetStates).toEqual([false, false, false]);
    expect(route.bulk).toBe(true);
  });

  it("does NOT batch when a sibling detector is still meant to run", async () => {
    // THE REPORTED BUG. The global schedule covers only deskAbsence; the line
    // crossing detector was started from the camera's own settings as Always On.
    // At 18:00 deskAbsence closes — batching would stop lineCrossing too.
    const index = createGlobalScheduleIndex([globalCovering([DESK])]);
    const channel = camera({
      [DESK]: { enabled: true },
      [LINE]: { enabled: true, schedule: alwaysOn },
    });

    at("18:00");
    const route = await routeFor(channel, index, "stop");
    // One detector wants to stop, the other to keep running.
    expect(sorted(route.targetStates)).toEqual([false, true]);
    expect(route.bulk).toBe(false); // falls back to the per-detector path
  });

  it("does NOT batch when a sibling is on a different window that has not closed", async () => {
    // deskAbsence closes at 18:00; lineCrossing runs until 22:00.
    const index = createGlobalScheduleIndex([globalCovering([DESK])]);
    const channel = camera({
      [DESK]: { enabled: true },
      [LINE]: { enabled: true, schedule: eveningShift },
    });

    at("18:00");
    expect((await routeFor(channel, index, "stop")).bulk).toBe(false);

    // By 22:00 both are closed, so the camera may move as one again.
    at("22:00");
    expect((await routeFor(channel, index, "stop")).bulk).toBe(true);
  });

  it("does NOT batch a resume at all — starts go through POST /stream", async () => {
    // deskAbsence opens at 09:00; lineCrossing is ungoverned and switched off,
    // so a resume-all would wrongly start it.
    const index = createGlobalScheduleIndex([globalCovering([DESK])]);
    const channel = camera({
      [DESK]: { enabled: false },
      [LINE]: { enabled: false },
    });

    at("09:00");
    const route = await routeFor(channel, index, "resume");
    expect(sorted(route.targetStates)).toEqual([false, true]);
    expect(route.bulk).toBe(false);
  });

  it("leaves an ungoverned detector out of the decision only when it agrees", async () => {
    // An ungoverned detector that is already stopped does not block a stop batch.
    const index = createGlobalScheduleIndex([globalCovering([DESK])]);
    const channel = camera({
      [DESK]: { enabled: true },
      [LINE]: { enabled: false },
    });

    at("18:00");
    expect((await routeFor(channel, index, "stop")).bulk).toBe(true);
  });

  it("walks the reported camera through a day without ever stopping the sibling early", async () => {
    const index = createGlobalScheduleIndex([globalCovering([DESK])]);
    const channel = camera({
      [DESK]: { enabled: true },
      [LINE]: { enabled: true, schedule: alwaysOn },
    });

    for (const hhmm of ["08:00", "09:00", "12:00", "17:59", "18:00", "20:00", "23:00"]) {
      at(hhmm);
      const { targetStates, bulk } = await routeFor(channel, index, "stop");
      // lineCrossing is Always On, so at every hour of the day at least one
      // detector still wants to run. If that ever stops being true, the
      // sibling is being swept into a stop it never asked for.
      // lineCrossing always runs; deskAbsence adds a second only inside
      // the global 09:00-18:00 window.
      const inOfficeHours = hhmm >= "09:00" && hhmm < "18:00";
      expect({ hhmm, running: targetStates.filter(Boolean).length }).toEqual({
        hhmm,
        running: inOfficeHours ? 2 : 1,
      });
      // ...and a stop batch is never allowed while it wants to run.
      expect({ hhmm, bulk }).toEqual({ hhmm, bulk: false });
    }
  });
});
