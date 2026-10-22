/**
 * Door open/close incidents, DS -> Node (DS door contract §5): one incident
 * per door per episode. The first alert creates it; repeat alerts and the
 * resolved post update it; a retried post changes and notifies nothing.
 * DS sends no eventId, so episodes are keyed by camera + door + stateSince
 * (an eventId wins if DS ever adds one). v2 and v1 createIncidents; socket
 * and alert fan-out mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../core/v2/alerts/alert.events.js", () => ({ triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../core/v1/alerts/alert.events.js", () => ({ triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined) }));

const { default: V2 } = await import("../../../core/v2/incidents/incidents.service.js");
const { default: V1 } = await import("../../../core/v1/incidents/incidents.service.js");
const { DoorStatusIncident } = await import("../../../core/v2/incidents/incidents.model.js");
const { DoorDetectionSetting } = await import("../../../core/v2/detectionSettings/detectionSettings.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { triggerAlertOnIncident: alertV2 } = await import("../../../core/v2/alerts/alert.events.js");
const { triggerAlertOnIncident: alertV1 } = await import("../../../core/v1/alerts/alert.events.js");

let admin;
let nvr;
let channel;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  admin = await Admin.create({ user_id: "door-u", login: "door-u", email: "door@test.com" });
  nvr = await NVR.create({ userId: "door-u", nvrName: "NVR", brand: "hikvision", domain: "http://nvr.test", location: "HQ", localNvrId: "door-nvr" });
  const setting = await DoorDetectionSetting.create({
    userId: "door-u", settingType: "doorDetectionSettings", name: "Door", enabled: true,
    settings: { zone_configs: [{ name: "Stock Door", threshold_sec: 300 }] },
  });
  channel = await Channel.create({
    nvrId: nvr._id, userId: "door-u", streamingPath: "/s", localChannelId: "1", name: "Lobby", isAdded: true,
    detections: { doorDetectionSettings: { id: setting._id, enabled: true } },
  });
});

// DS's live alert post (2026-10-22): no eventId, Image an Oracle storage key.
const image = "/oracle/uploads/images/door-open-close/1792649709973-0a4085c0-doorDetection_cam_20261022_114511.jpg";
const post = (extra = {}) => ({
  incidentType: "doorDetection", incidentName: "Door Open Too Long",
  description: "Stock Door has been open for 5 min (alert after 5 min).", timeOfIncident: "2026-10-22T06:10:11Z",
  videoLink: "", cameraId: String(channel._id), nvrId: String(nvr._id), channelId: String(channel._id), adminId: String(admin._id),
  Image: image, zone: "Stock Door", zoneName: "Stock Door", type: "gauge", severity: "moderate",
  alertThreshold: 400, triggerNotification: true, count: 1, doorStatus: "open", isResolved: false,
  stateSince: "2026-10-22T06:05:11Z", thresholdSec: 300, durationSec: 300, alertCount: 1,
  ...extra,
});
const send = async (body, Service = V2) => {
  const { req, res, next } = serviceCtx({ body });
  await Service.createIncidents(req, res, next);
  return payload(res);
};
const repeat = { alertCount: 2, durationSec: 600, description: "Stock Door has been open for 10 min (alert after 5 min).", timeOfIncident: "2026-10-22T06:15:11Z" };
const resolved = {
  isResolved: true, alertCount: 2, durationSec: 750, triggerNotification: false, incidentName: "Door Open Alert Resolved",
  description: "Stock Door was open for 12 min 30 s and is now closed.", timeOfIncident: "2026-10-22T06:17:41Z",
};

describe("one incident per door per episode (v2)", () => {
  it("first alert creates the incident and notifies", async () => {
    await send(post());
    const [incident] = await DoorStatusIncident.find().lean();
    expect(incident).toMatchObject({
      eventId: `${channel._id}:Stock Door:2026-10-22T06:05:11Z`, Image: image,
      doorStatus: "open", zoneName: "Stock Door", alertCount: 1, isResolved: false, thresholdSec: 300,
    });
    expect(incident.lastAlertAt.toISOString()).toBe("2026-10-22T06:10:11.000Z");
    expect(alertV2).toHaveBeenCalledTimes(1);
  });

  it("a repeat alert updates the same incident and notifies again; a retry of it does nothing", async () => {
    await send(post());
    await send(post(repeat));
    const retry = await send(post(repeat));
    expect(retry.data.duplicate).toBe(true);
    const incidents = await DoorStatusIncident.find().lean();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ alertCount: 2, durationSec: 600, description: repeat.description });
    expect(alertV2).toHaveBeenCalledTimes(2);
  });

  it("the resolved post closes the episode without notifying", async () => {
    await send(post());
    await send(post(repeat));
    await send(post(resolved));
    const [incident] = await DoorStatusIncident.find().lean();
    expect(incident).toMatchObject({ isResolved: true, durationSec: 750, alertCount: 2, incidentName: "Door Open Alert Resolved", resolved: false });
    expect(incident.stateEndedAt.toISOString()).toBe("2026-10-22T06:17:41.000Z");
    expect(incident.timeOfIncident.toISOString()).toBe("2026-10-22T06:10:11.000Z");
    expect(alertV2).toHaveBeenCalledTimes(2);
    expect((await send(post(resolved))).data.duplicate).toBe(true);
  });

  it("groups by camera + door + stateSince; another door or episode is its own incident", async () => {
    await send(post());
    await send(post(repeat));
    await send(post({ zone: "Back Door", zoneName: "Back Door" }));
    await send(post({ stateSince: "2026-10-22T08:00:00Z" }));
    const incidents = await DoorStatusIncident.find().sort({ _id: 1 }).lean();
    expect(incidents.map((i) => [i.zoneName, i.alertCount])).toEqual([["Stock Door", 2], ["Back Door", 1], ["Stock Door", 1]]);
  });

  it("keys on an eventId if DS sends one", async () => {
    await send(post({ eventId: "door_stock_0_1792649111" }));
    await send(post({ eventId: "door_stock_0_1792649111", ...repeat, stateSince: "2026-10-22T06:05:12Z" }));
    const incidents = await DoorStatusIncident.find().lean();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ eventId: "door_stock_0_1792649111", alertCount: 2 });
  });

  it("accepts DS's uppercase status too", async () => {
    await send(post({ doorStatus: "CLOSED", incidentName: "Door Closed Too Long" }));
    expect((await DoorStatusIncident.findOne().lean()).doorStatus).toBe("closed");
  });
});

describe("v1 endpoint (the one the contract names)", () => {
  it("handles the same episode the same way", async () => {
    await send(post(), V1);
    await send(post(repeat), V1);
    await send(post(resolved), V1);
    const incidents = await DoorStatusIncident.find().lean();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ isResolved: true, alertCount: 2, durationSec: 750 });
    expect(alertV1).toHaveBeenCalledTimes(2);
  });
});
