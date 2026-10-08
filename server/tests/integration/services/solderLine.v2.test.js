import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const { default: SolderLineService, recordSolderPanel } = await import("../../../core/v2/incidents/solderLine.service.js");
const { default: SolderPanel } = await import("../../../core/v2/incidents/solderPanel.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { DeskSolarShoulderDetectionIncident } = await import("../../../core/v2/incidents/incidents.model.js");

let admin;
let channel;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: "solder-user", login: "solder-user", email: "solder@test.com" });
  const nvr = await NVR.create({
    userId: admin.user_id,
    nvrName: "Solder NVR",
    brand: "hikvision",
    domain: "http://solder-nvr.test",
    location: "solder line",
    localNvrId: "solder-line-nvr",
  });
  channel = await Channel.create({
    userId: admin.user_id,
    nvrId: nvr._id,
    localChannelId: "1",
    name: "ST-01 Overhead",
    streamingPath: "/Streaming/Channels/101",
    isAdded: true,
  });
});

// DS's "Solar panel processing" payload.
const panel = (panelId, time, left, right) => ({
  incidentType: "deskSolarShoulderDetection",
  incidentName: "Solar panel processing",
  panelId,
  timeOfIncident: time,
  zones: {
    worker_zone_left: { presence_time: left[0], shoulderings_done: left[1] },
    worker_zone_right: { presence_time: right[0], shoulderings_done: right[1] },
  },
});

describe("solder line panels and overview", () => {
  it("stores DS panels once and aggregates throughput per IST hour and zone", async () => {
    const record = (body) => recordSolderPanel({ userId: admin.user_id, channelId: channel._id, body });
    // 06:10 IST, complete
    const first = await record(panel("PNL-0001", "2026-10-07T00:40:00Z", [14.3, 3], [12.8, 3]));
    expect(first.missedJoints).toBe(0);
    await record(panel("PNL-0001", "2026-10-07T00:40:00Z", [14.3, 3], [12.8, 3])); // DS retry
    // 06:20 IST, right zone left one joint undone
    const second = await record(panel("PNL-0002", "2026-10-07T00:50:00Z", [12, 3], [10, 2]));
    expect(second.missedJoints).toBe(1);
    expect(await SolderPanel.countDocuments()).toBe(2);

    await DeskSolarShoulderDetectionIncident.create([
      { nvrId: channel.nvrId, channelId: channel._id, userId: admin.user_id, zone: "worker_zone_right", timeOfIncident: new Date("2026-10-07T01:00:00Z"), durationSec: 20 },
      {
        nvrId: channel.nvrId, channelId: channel._id, userId: admin.user_id, eventType: "panel", panelId: "PNL-0002",
        zones: second.zones, missedJoints: 1, timeOfIncident: new Date("2026-10-07T00:50:00Z"),
      },
    ]);

    const ctx = serviceCtx({ user_id: admin.user_id, adminId: admin._id, query: { startDate: "2026-10-07" } });
    await SolderLineService.getSolderLine(ctx.req, ctx.res, ctx.next);
    const data = payload(ctx.res).data;

    expect(data.pointsPerZone).toBe(3);
    expect(data.stations.map((s) => s._id)).toEqual([channel._id.toString()]);
    expect(data.absences).toHaveLength(1);
    expect(data.missed).toEqual([expect.objectContaining({ panelId: "PNL-0002", zone: "worker_zone_right", done: 2 })]);
    expect(data.hourly).toEqual([{
      channelId: channel._id.toString(),
      hour: "2026-10-07T06",
      panels: 2,
      zones: expect.arrayContaining([
        { zone: "worker_zone_left", joints: 6, solderSec: 26.3, missed: 0 },
        { zone: "worker_zone_right", joints: 5, solderSec: 22.8, missed: 1 },
      ]),
    }]);
  });
});
