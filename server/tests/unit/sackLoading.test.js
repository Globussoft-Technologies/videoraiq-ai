import { describe, expect, it } from "vitest";
import { sackIncidentSchema, sackSettingsSchema, sackDetector } from "../../services/sackLoading.js";
import { SackLoadingUnloadingSetting } from "../../core/v1/detectionSettings/detectionSettings.model.js";
import { SackLoadingUnloadingIncident } from "../../core/v1/incidents/incidents.model.js";
import { boxSplitLabel, directionSplitLabel } from "../../../client_v2/src/pages/IncidentLogs/stockMovement.js";

const event = { eventId: "event-1", vehicleSessionId: "visit-1", timeOfIncident: "2026-11-16T05:31:09Z",
  incidentName: "Sack Unloading Detected", direction: "unloading", sackCount: 2,
  whiteSackCount: 2, brownSackCount: 0, otherSackCount: 0, cottonBoxCount: 1, totalCount: 3 };
describe("sack loading/unloading contracts", () => {
  it.each(["loading", "unloading", "both"])("stores and transmits %s mode without dropping the per-zone value", mode => {
    const settings = { mode, zone_configs: [{ name: "Bay", activity_mode: mode }] };
    expect(sackSettingsSchema.validate(settings, { convert: false }).error).toBeUndefined();
    const doc = new SackLoadingUnloadingSetting({ name: "Sacks", userId: "13", enabled: true, settings });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.settings.zone_configs[0].activity_mode).toBe(mode);
    expect(sackDetector({ zones: [[[0, 0], [100, 0], [100, 100]]], zone_configs: settings.zone_configs, settings })).toMatchObject({
      mode, zone_configs: [{ name: "Bay", activity_mode: mode }],
    });
  });
  it("rejects unsupported activity modes and missing zone names", () => {
    expect(sackSettingsSchema.validate({ zone_configs: [{ name: "Bay", activity_mode: "all" }] }).error).toBeTruthy();
    expect(sackSettingsSchema.validate({ zone_configs: [{ activity_mode: "both" }] }).error).toBeTruthy();
  });
  it.each([{ totalCount: 9 }, { sackCount: 3 }, { sackCount: -1 }, { whiteSackCount: 1.5 }, { direction: "both" }])("rejects malformed event totals/direction: %j", fields => {
    expect(sackIncidentSchema.validate({ ...event, ...fields }, { convert: false }).error).toBeTruthy();
  });
  it("persists all original sack counters and renders their split in grouped and expanded rows", () => {
    expect(sackIncidentSchema.validate(event).error).toBeUndefined();
    const doc = new SackLoadingUnloadingIncident({ ...event, userId: "13", nvrId: "0123456789abcdef01234567", channelId: "0123456789abcdef01234568" });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.toObject()).toMatchObject({ ...event, timeOfIncident: new Date(event.timeOfIncident) });
    expect(boxSplitLabel(event)).toBe("White sacks: 2, Brown sacks: 0, Other sacks: 0, Cotton boxes: 1");
    expect(directionSplitLabel({ events: [event, event] }, "unloading")).toContain("Cotton boxes: 2");
  });
});
