import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const { default: SolderLineService } = await import("../../../core/v2/incidents/solderLine.service.js");
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

const post = async (body) => {
  const ctx = serviceCtx({ user_id: admin.user_id, adminId: admin._id, body });
  await SolderLineService.recordPanel(ctx.req, ctx.res, ctx.next);
  return ctx.res;
};

describe("solder line panels and overview", () => {
  it("dedupes retried panels and aggregates throughput per IST hour and zone", async () => {
    const panel = {
      adminId: admin._id.toString(),
      channelId: channel._id.toString(),
      panelId: "PNL-0001",
      // 06:10 IST
      time: "2026-10-07T00:40:00Z",
      joints: [
        { point: 1, zone: "Workstation 1", solderSec: 4 },
        { point: 2, zone: "Workstation 1", solderSec: 5 },
        { point: 4, zone: "Workstation 2", solderSec: 6 },
      ],
    };
    expect((await post(panel)).statusCode).toBe(200);
    expect((await post(panel)).statusCode).toBe(200); // DS retry
    await post({ ...panel, panelId: "PNL-0002", time: "2026-10-07T00:50:00Z", joints: [{ point: 1, zone: "Workstation 1", solderSec: 3 }] });
    expect(await SolderPanel.countDocuments()).toBe(2);
    expect((await post({ ...panel, channelId: "507f1f77bcf86cd799439099" })).statusCode).toBe(400);

    await DeskSolarShoulderDetectionIncident.create([
      { nvrId: channel.nvrId, channelId: channel._id, userId: admin.user_id, zone: "Workstation 2", timeOfIncident: new Date("2026-10-07T01:00:00Z"), durationSec: 20 },
      { nvrId: channel.nvrId, channelId: channel._id, userId: admin.user_id, zone: "Workstation 2", eventType: "missedSolder", point: 5, panelId: "PNL-0001", timeOfIncident: new Date("2026-10-07T00:41:00Z") },
    ]);

    const ctx = serviceCtx({ user_id: admin.user_id, adminId: admin._id, query: { startDate: "2026-10-07" } });
    await SolderLineService.getSolderLine(ctx.req, ctx.res, ctx.next);
    const data = payload(ctx.res).data;

    expect(data.stations.map((s) => s._id)).toEqual([channel._id.toString()]);
    expect(data.absences).toHaveLength(1);
    expect(data.missed).toEqual([expect.objectContaining({ point: 5, panelId: "PNL-0001" })]);
    expect(data.hourly).toEqual([{
      channelId: channel._id.toString(),
      hour: "2026-10-07T06",
      panels: 2,
      zones: expect.arrayContaining([
        { zone: "Workstation 1", joints: 3, solderSec: 12 },
        { zone: "Workstation 2", joints: 1, solderSec: 6 },
      ]),
    }]);
  });
});
