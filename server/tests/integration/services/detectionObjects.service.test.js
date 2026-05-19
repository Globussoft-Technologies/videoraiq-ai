/**
 * Integration test for ObjectsService (detectionObjects) — CRUD against
 * in-memory MongoDB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: ObjectsService } = await import(
  "../../../core/v1/detectionObjects/objects.service.js"
);
const { default: DetectionObjects } = await import(
  "../../../core/v1/detectionObjects/objects.model.js"
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

describe("ObjectsService.createDetectionObjects", () => {
  it("upserts a new detection-objects record (201)", async () => {
    const { req, res, next } = serviceCtx({
      body: { settingType: "crowdDetection", objects: ["crowd"] },
    });
    await ObjectsService.createDetectionObjects(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    const doc = await DetectionObjects.findOne({ settingType: "crowdDetection" });
    expect(doc.objects).toContain("crowd");
  });

  it("adds only new objects to an existing record ($addToSet)", async () => {
    await DetectionObjects.create({
      settingType: "crowdDetection",
      objects: ["crowd"],
    });
    const { req, res, next } = serviceCtx({
      body: { settingType: "crowdDetection", objects: ["crowd", "group"] },
    });
    await ObjectsService.createDetectionObjects(req, res, next);
    const doc = await DetectionObjects.findOne({ settingType: "crowdDetection" });
    expect(doc.objects.sort()).toEqual(["crowd", "group"]);
  });

  it("returns 400 for an invalid settingType (enum)", async () => {
    const { req, res, next } = serviceCtx({
      body: { settingType: "notARealType", objects: ["x"] },
    });
    await ObjectsService.createDetectionObjects(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("ObjectsService.getAllObjects", () => {
  it("returns all records, formatted with display names", async () => {
    await DetectionObjects.create({
      settingType: "personalProtectiveEquipment",
      objects: ["vest", "helmet"],
    });
    const { req, res, next } = serviceCtx();
    await ObjectsService.getAllObjects(req, res, next);
    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data[0].settingType).toBe("personalProtectiveEquipment");
    expect(data[0].objects).toEqual(["helmet", "vest"]); // sorted
    expect(data[0].name).toBeTruthy();
  });

  it("returns an empty list when there are no records", async () => {
    const { req, res, next } = serviceCtx();
    await ObjectsService.getAllObjects(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data).toEqual([]);
  });
});

describe("ObjectsService.deleteDetectionObjectsByType", () => {
  it("returns 400 for a missing settingType / empty objects", async () => {
    const { req, res, next } = serviceCtx({ body: { objects: [] } });
    await ObjectsService.deleteDetectionObjectsByType(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the settingType record is missing", async () => {
    const { req, res, next } = serviceCtx({
      body: { settingType: "crowdDetection", objects: ["crowd"] },
    });
    await ObjectsService.deleteDetectionObjectsByType(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("pulls the listed objects from the record", async () => {
    await DetectionObjects.create({
      settingType: "crowdDetection",
      objects: ["crowd", "group", "queue"],
    });
    const { req, res, next } = serviceCtx({
      body: { settingType: "crowdDetection", objects: ["group"] },
    });
    await ObjectsService.deleteDetectionObjectsByType(req, res, next);
    expect(res.statusCode).toBe(200);
    const doc = await DetectionObjects.findOne({ settingType: "crowdDetection" });
    expect(doc.objects).not.toContain("group");
    expect(doc.objects.sort()).toEqual(["crowd", "queue"]);
  });
});
