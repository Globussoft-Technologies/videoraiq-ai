/**
 * createAccessLogRecord — cameraId/nvrId become optional when liveDemoData
 * is true. Real access logs still require both (validation failure
 * otherwise). A live-demo session has no camera behind it: the session
 * subdocument must save without nvr/channel.
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
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: OptimizedAccessLogs } = await import(
  "../../../core/v1/accesslogs/newAccessLogs.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("AccessLogsService.createAccessLogRecord — liveDemoData without cameraId/nvrId", () => {
  it("creates a session with no nvr/channel when liveDemoData is true", async () => {
    const admin = await Admin.create({ user_id: "demo-al-1", login: "a", email: "a@test.com" });
    const { req, res, next } = serviceCtx({
      body: {
        adminId: admin._id.toString(),
        personName: "Demo Visitor",
        liveDemoData: true,
        images: { face: "demo.jpg" },
      },
    });

    await AccessLogsService.createAccessLogRecord(req, res, next);

    expect(payload(res).status).toBe("success");
    const stored = await OptimizedAccessLogs.findOne({ admin: admin._id.toString() });
    expect(stored).not.toBeNull();
    expect(stored.liveDemoData).toBe(true);
    expect(stored.sessions[0].nvr).toBeUndefined();
    expect(stored.sessions[0].channel).toBeUndefined();
  });

  it("handles a synthetic non-ObjectId cameraId (video:<id>) from the demo pipeline without crashing", async () => {
    // Reproduces the reported production payload: liveDemoData true, a
    // "video:<hex>" cameraId (not a real ObjectId) and a 32-hex (non-24)
    // nvrId — both previously threw an unhandled Mongoose CastError.
    const admin = await Admin.create({ user_id: "demo-al-3", login: "a3", email: "a3@test.com" });
    const { req, res, next } = serviceCtx({
      body: {
        adminId: admin._id.toString(),
        personName: "unknown",
        cameraId: "video:e82c0cfc49724e36a727e4a96104d5b5",
        nvrId: "e82c0cfc49724e36a727e4a96104d5b5",
        liveDemoData: true,
        videoId: new mongoose.Types.ObjectId().toString(),
        images: { person: "https://nas.example.com/crop.jpg" },
      },
    });

    await AccessLogsService.createAccessLogRecord(req, res, next);

    expect(payload(res).status).toBe("success");
    const stored = await OptimizedAccessLogs.findOne({ admin: admin._id.toString() });
    expect(stored).not.toBeNull();
    expect(stored.liveDemoData).toBe(true);
    expect(stored.videoId).not.toBeNull();
    expect(stored.sessions[0].nvr).toBeUndefined();
    expect(stored.sessions[0].channel).toBeUndefined();
  });

  it("rejects a non-demo record missing cameraId", async () => {
    const admin = await Admin.create({ user_id: "demo-al-2", login: "a2", email: "a2@test.com" });
    const { req, res, next } = serviceCtx({
      body: {
        adminId: admin._id.toString(),
        personName: "Real Visitor",
        nvrId: new mongoose.Types.ObjectId().toString(),
        images: { face: "real.jpg" },
      },
    });

    await AccessLogsService.createAccessLogRecord(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/cameraId is required/i);
  });
});
