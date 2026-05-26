/**
 * Real vertical Supertest contract for `/api/v1/detection-objects` —
 * mounts the real router on a fresh Express app and exercises the actual
 * controller + service + Mongo persistence. Targets
 * `objects.controller.js` (0% covered) and the route module itself.
 *
 * Mocks:
 *   1. middlewares/permissionMiddleware.js — wave all CRUD verbs through
 *
 * Total: 1 mock. Everything else (Mongo upsert/$addToSet/$pull, the
 * formatted-list mapping, validation guard) runs for real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: objectsRoutes } = await import(
  "../../core/v1/detectionObjects/objects.routes.js"
);
const { default: DetectionObjects } = await import(
  "../../core/v1/detectionObjects/objects.model.js"
);

let app;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  app = buildApp((a) => a.use("/api/v1/detection-objects", objectsRoutes));
});

const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// POST /  →  createDetectionObjects
// ----------------------------------------------------------------------------
describe("POST /api/v1/detection-objects (real vertical)", () => {
  it("upserts a new detection-objects record (201)", async () => {
    const res = await request(app)
      .post("/api/v1/detection-objects")
      .send({ settingType: "crowdDetection", objects: ["crowd"] });
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");
    const doc = await DetectionObjects.findOne({
      settingType: "crowdDetection",
    });
    expect(doc).not.toBeNull();
    expect(doc.objects).toContain("crowd");
  });

  it("merges new objects into an existing record via $addToSet", async () => {
    await DetectionObjects.create({
      settingType: "crowdDetection",
      objects: ["crowd"],
    });
    const res = await request(app)
      .post("/api/v1/detection-objects")
      .send({
        settingType: "crowdDetection",
        objects: ["crowd", "group"], // 'crowd' should de-dupe
      });
    expect(res.status).toBe(201);
    const doc = await DetectionObjects.findOne({
      settingType: "crowdDetection",
    });
    expect(doc.objects.sort()).toEqual(["crowd", "group"]);
  });

  it("returns 400 when settingType fails the enum validator", async () => {
    const res = await request(app)
      .post("/api/v1/detection-objects")
      .send({ settingType: "notARealType", objects: ["x"] });
    expect(res.status).toBe(400);
    expect(inner(res).status).toBe("failed");
  });

  it("accepts an empty objects array (no-op upsert)", async () => {
    const res = await request(app)
      .post("/api/v1/detection-objects")
      .send({ settingType: "personalProtectiveEquipment", objects: [] });
    expect(res.status).toBe(201);
    const doc = await DetectionObjects.findOne({
      settingType: "personalProtectiveEquipment",
    });
    expect(doc).not.toBeNull();
    expect(doc.objects).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// GET /  →  getAllObjects
// ----------------------------------------------------------------------------
describe("GET /api/v1/detection-objects (real vertical)", () => {
  it("returns formatted, sorted records with display names", async () => {
    await DetectionObjects.create({
      settingType: "personalProtectiveEquipment",
      objects: ["vest", "helmet"],
    });
    const res = await request(app).get("/api/v1/detection-objects");
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data).toHaveLength(1);
    expect(data[0].settingType).toBe("personalProtectiveEquipment");
    // objects sorted alphabetically
    expect(data[0].objects).toEqual(["helmet", "vest"]);
    expect(typeof data[0].name).toBe("string");
    expect(data[0].name.length).toBeGreaterThan(0);
  });

  it("returns an empty array when no records exist", async () => {
    const res = await request(app).get("/api/v1/detection-objects");
    expect(res.status).toBe(200);
    expect(inner(res).data).toEqual([]);
  });

  it("returns multiple records sorted by settingType ascending", async () => {
    await DetectionObjects.create([
      { settingType: "personalProtectiveEquipment", objects: ["vest"] },
      { settingType: "crowdDetection", objects: ["crowd"] },
    ]);
    const res = await request(app).get("/api/v1/detection-objects");
    expect(res.status).toBe(200);
    const types = inner(res).data.map((d) => d.settingType);
    expect(types).toEqual(["crowdDetection", "personalProtectiveEquipment"]);
  });
});

// ----------------------------------------------------------------------------
// POST /delete  →  deleteDetectionObjectsByType
// ----------------------------------------------------------------------------
describe("POST /api/v1/detection-objects/delete (real vertical)", () => {
  it("returns 400 when settingType is missing", async () => {
    const res = await request(app)
      .post("/api/v1/detection-objects/delete")
      .send({ objects: ["crowd"] });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
  });

  it("returns 400 when objects is empty", async () => {
    const res = await request(app)
      .post("/api/v1/detection-objects/delete")
      .send({ settingType: "crowdDetection", objects: [] });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no record matches settingType", async () => {
    const res = await request(app)
      .post("/api/v1/detection-objects/delete")
      .send({ settingType: "crowdDetection", objects: ["crowd"] });
    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });

  it("pulls the listed objects from the existing record (200)", async () => {
    await DetectionObjects.create({
      settingType: "crowdDetection",
      objects: ["crowd", "group", "queue"],
    });
    const res = await request(app)
      .post("/api/v1/detection-objects/delete")
      .send({ settingType: "crowdDetection", objects: ["group"] });
    expect(res.status).toBe(200);
    const doc = await DetectionObjects.findOne({
      settingType: "crowdDetection",
    });
    expect(doc.objects).not.toContain("group");
    expect(doc.objects.sort()).toEqual(["crowd", "queue"]);
  });

  it("leaves the record intact when the listed objects don't match", async () => {
    await DetectionObjects.create({
      settingType: "crowdDetection",
      objects: ["crowd"],
    });
    const res = await request(app)
      .post("/api/v1/detection-objects/delete")
      .send({ settingType: "crowdDetection", objects: ["nothere"] });
    expect(res.status).toBe(200);
    const doc = await DetectionObjects.findOne({
      settingType: "crowdDetection",
    });
    expect(doc.objects).toEqual(["crowd"]);
  });
});
