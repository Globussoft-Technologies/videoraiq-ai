/**
 * Integration test for DetectionSettingsService — the pure + not-found paths
 * against in-memory MongoDB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DetectionSettingsService } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.service.js"
);
await import("../../../core/v1/channels/channels.model.js");
await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("DetectionSettingsService.getDetectionTypes", () => {
  it("returns the detection-types map (200)", async () => {
    const { req, res, next } = serviceCtx();
    await DetectionSettingsService.getDetectionTypes(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.detectionTypes).toBeTypeOf("object");
  });
});

describe("DetectionSettingsService.getDetectionExamples", () => {
  it("returns example payloads (200)", async () => {
    const { req, res, next } = serviceCtx();
    await DetectionSettingsService.getDetectionExamples(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("DetectionSettingsService.createDetectionSettings", () => {
  it("returns 400 for an invalid body", async () => {
    const { req, res, next } = serviceCtx({ user_id: "1", body: {} });
    await DetectionSettingsService.createDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });
});

describe("DetectionSettingsService.deleteDetectionSettings", () => {
  it("returns 404 for an unknown setting", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "1",
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await DetectionSettingsService.deleteDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("DetectionSettingsService.getDetectionSettings", () => {
  it("returns 404 for an unknown setting", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "1",
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await DetectionSettingsService.getDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
