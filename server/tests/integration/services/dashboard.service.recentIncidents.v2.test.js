/**
 * DashboardService.recentIncidents — exercises the admin/no-sidebar guards,
 * the empty-enabled-detections guard, and the NVR/channel/location/department
 * filter branches that fan out into the aggregation pipeline. The aggregation
 * itself runs against the in-memory Mongo so no method-level mocks are needed.
 *
 * Exercises the v2 projection/lean optimization with disposable MongoDB.
 * Mocks: 0
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import request from "supertest";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DashboardService } = await import(
  "../../../core/v2/dashboard/dashboard.service.js"
);
const { default: OriginalService } = await import("../../../core/v1/dashboard/dashboard.service.js");
const { default: routes } = await import("../../../core/v2/dashboard/dashboard.routes.js");
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: DashboardSidebar } = await import(
  "../../../core/v1/dashboard/dashboardSidebar.model.js"
);
const incidentsModel = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { Incident } = incidentsModel;
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: NVR } = await import(
  "../../../core/v1/NVR/nvr.model.js"
);

const USER_ID = "55";

let admin;
let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  if (!mongo || mongoose.connection.port !== mongo.instanceInfo.port) {
    throw new Error("Fixture writes require disposable MongoDB");
  }
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
  admin = await Admin.create({
    user_id: USER_ID,
    login: "recent",
    email: "recent@test.com",
  });
});

async function seedSidebar(types = ["countPersons"], enabled = true) {
  return DashboardSidebar.create({
    adminId: admin._id,
    detectionConfigs: types.map((t) => ({
      detectionType: t,
      isEnabled: enabled,
    })),
  });
}

function ctx(overrides = {}) {
  return serviceCtx({
    adminId: admin._id,
    user_id: USER_ID,
    body: {},
    query: {},
    ...overrides,
  });
}

describe("DashboardService.recentIncidents", () => {
  it("preserves Mongoose defaults and casting for legacy sidebar settings", async () => {
    await DashboardSidebar.collection.insertOne({ adminId: admin._id });
    for (const detectionConfigs of [undefined, [{ detectionType: "countPersons", isEnabled: "false" }]]) {
      if (detectionConfigs) await DashboardSidebar.collection.updateOne({ adminId: admin._id }, { $set: { detectionConfigs } });
      const original = ctx();
      const updated = ctx();
      await OriginalService.recentIncidents(original.req, original.res, original.next);
      await DashboardService.recentIncidents(updated.req, updated.res, updated.next);
      expect(updated.res._body).toEqual(original.res._body);
      expect(payload(updated.res).message).toBe("No enabled detection types found");
    }
  });
  it("preserves the complete response and HTTP output against the unchanged v1 implementation", async () => {
    await seedSidebar(["countPersons", "lineCrossing"], true);
    const nvr = new mongoose.Types.ObjectId();
    const camera = new mongoose.Types.ObjectId();
    const department = new mongoose.Types.ObjectId();
    await NVR.collection.insertOne({ _id: nvr, userId: USER_ID, nvrName: "Entrance", location: "site-A" });
    await Channel.collection.insertOne({ _id: camera, userId: USER_ID, name: "Camera", department: [department] });
    await Incident.collection.insertMany([
      { userId: USER_ID, incidentType: "countPersons", nvrId: nvr, channelId: camera, Image: "old.jpg", timeOfIncident: new Date("2026-06-01") },
      { userId: USER_ID, incidentType: "countPersons", nvrId: nvr, channelId: camera, Image: "new.jpg", timeOfIncident: new Date("2026-06-02") },
      { userId: "other", incidentType: "countPersons", Image: "other.jpg", timeOfIncident: new Date("2026-06-03") },
    ]);
    for (const query of [{}, { location: "site-A" }, { department: department.toString() }, { nvrId: nvr.toString(), channelId: camera.toString() }]) {
      const original = ctx({ query });
      const updated = ctx({ query });
      await OriginalService.recentIncidents(original.req, original.res, original.next);
      await DashboardService.recentIncidents(updated.req, updated.res, updated.next);
      expect(updated.res._body).toEqual(original.res._body);
      const app = express();
      app.use((req, _res, next) => { req.verified = updated.req.verified; next(); });
      app.use("/api/v2/dashboard", routes);
      const response = await request(app).get("/api/v2/dashboard/recentIncidents").query(query);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(JSON.parse(JSON.stringify(original.res._body)));
    }
  });
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: USER_ID,
      query: {},
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns success with no data when no sidebar config exists", async () => {
    const { req, res, next } = ctx();
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/No sidebar config/);
  });

  it("returns success with no data when no detection types are enabled", async () => {
    await seedSidebar(["countPersons"], false);
    const { req, res, next } = ctx();
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/No enabled detection types/);
  });

  it("returns a default empty entry for each enabled type when no incidents exist", async () => {
    await seedSidebar(["countPersons", "lineCrossing"], true);
    const { req, res, next } = ctx();
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    expect(data).toHaveProperty("countPersons");
    expect(data).toHaveProperty("lineCrossing");
    expect(data.countPersons).toEqual({});
  });

  it("returns the latest incident per enabled detection type with displayName", async () => {
    await seedSidebar(["countPersons"], true);
    const older = new Date(Date.now() - 60_000);
    const newer = new Date();
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: older,
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      Image: "https://img/old.jpg",
    });
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: newer,
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      Image: "https://img/new.jpg",
    });
    const { req, res, next } = ctx();
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
    const cp = payload(res).data.countPersons;
    expect(cp.displayName).toBe("Person Counting");
    expect(cp.Image).toBe("https://img/new.jpg");
  });

  it("filters out incidents with empty/placeholder Image values", async () => {
    await seedSidebar(["countPersons"], true);
    // No usable image — should be filtered by the $nin guard.
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      Image: "https://",
    });
    const { req, res, next } = ctx();
    await DashboardService.recentIncidents(req, res, next);
    // No match — defaults to {}
    expect(payload(res).data.countPersons).toEqual({});
  });

  it("applies nvrId filter (string and CSV form) to the lookup", async () => {
    await seedSidebar(["countPersons"], true);
    const targetNvr = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: targetNvr,
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      Image: "https://img/x.jpg",
    });
    const { req, res, next } = ctx({
      query: { nvrId: `${targetNvr.toString()},${new mongoose.Types.ObjectId().toString()}` },
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.countPersons.Image).toBe("https://img/x.jpg");
  });

  it("applies channelId filter (array form) to the lookup", async () => {
    await seedSidebar(["countPersons"], true);
    const targetChannel = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: targetChannel,
      userId: USER_ID,
      Image: "https://img/c.jpg",
    });
    const { req, res, next } = ctx({
      query: { channelId: [targetChannel.toString()] },
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("applies the location filter by resolving NVRs first", async () => {
    await seedSidebar(["countPersons"], true);
    const nvr = await NVR.create({
      nvrName: "NVR-A",
      userId: USER_ID,
      location: "site-A",
      brand: "hikvision",
      domain: "http://nvr.local",
      localNvrId: "loc-recent-1",
    });
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: nvr._id,
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      Image: "https://img/loc.jpg",
    });
    const { req, res, next } = ctx({
      query: { location: "site-A,site-B" },
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("applies the department filter by resolving Channels first", async () => {
    await seedSidebar(["countPersons"], true);
    const deptId = new mongoose.Types.ObjectId();
    const channel = await Channel.create({
      name: "cam-1",
      userId: USER_ID,
      nvrId: new mongoose.Types.ObjectId(),
      department: [deptId],
      localChannelId: "loc-c-1",
      streamingPath: "/Streaming/Channels/101",
    });
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: channel.nvrId,
      channelId: channel._id,
      userId: USER_ID,
      Image: "https://img/dept.jpg",
    });
    const { req, res, next } = ctx({
      query: { department: [deptId.toString()] },
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("ignores invalid object-id filter inputs (no $in narrowing applied)", async () => {
    await seedSidebar(["countPersons"], true);
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      Image: "https://img/any.jpg",
    });
    const { req, res, next } = ctx({
      query: { nvrId: "not-a-valid-id", channelId: "also-junk" },
    });
    await DashboardService.recentIncidents(req, res, next);
    // With all ids invalid, the validNvrIds list is empty and filters are
    // skipped — so the seeded incident still matches.
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.countPersons.Image).toBe("https://img/any.jpg");
  });
});
