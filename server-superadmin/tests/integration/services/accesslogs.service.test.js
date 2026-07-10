/**
 * Integration test for the accesslogs service — createAccessLog lookup
 * cascade and getUserSessionReport, against in-memory MongoDB. Socket mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: AccessLogsService } = await import(
  "../../../core/v1/accesslogs/accesslogs.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("AccessLogsService.createAccessLog", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      body: { adminId: new mongoose.Types.ObjectId().toString() },
    });
    await AccessLogsService.createAccessLog(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/admin not found/i);
  });

  it("fails when the camera does not exist", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const { req, res, next } = serviceCtx({
      body: {
        adminId: admin._id.toString(),
        cameraId: new mongoose.Types.ObjectId().toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await AccessLogsService.createAccessLog(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/camera not found/i);
  });

  it("fails when the NVR does not exist", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "u1",
      streamingPath: "/s",
      localChannelId: "1",
      name: "Cam",
      isAdded: true,
    });
    const { req, res, next } = serviceCtx({
      body: {
        adminId: admin._id.toString(),
        cameraId: channel._id.toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await AccessLogsService.createAccessLog(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/nvr not found/i);
  });
});

describe("AccessLogsService.getUserSessionReport", () => {
  it("returns 400 when userId is missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await AccessLogsService.getUserSessionReport(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns a report for a user with no logs", async () => {
    const { req, res, next } = serviceCtx({
      body: { userId: new mongoose.Types.ObjectId().toString() },
    });
    await AccessLogsService.getUserSessionReport(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});
