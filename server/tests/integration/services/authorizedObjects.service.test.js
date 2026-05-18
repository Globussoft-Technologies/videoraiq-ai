/**
 * Integration test for authorizedObjectsService — CRUD against in-memory
 * MongoDB. The admin is looked up by user_id + email.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: AuthorizedObjectsService } = await import(
  "../../../core/v1/authorizedObjects/authorizedObjects.service.js"
);
const { default: AuthorizedObjects } = await import(
  "../../../core/v1/authorizedObjects/authorizedObjects.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

let admin;
const USER_ID = "7001";
const USER_EMAIL = "ao@test.com";

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: USER_ID,
    login: "admin",
    email: USER_EMAIL,
  });
});

function adminCtx(extra = {}) {
  return serviceCtx({
    user_id: USER_ID,
    user_email: USER_EMAIL,
    adminId: admin._id,
    ...extra,
  });
}

describe("authorizedObjectsService.createAuthorizedObjects", () => {
  it("creates a new authorized-objects record", async () => {
    const { req, res, next } = adminCtx({
      body: { objectType: "ppe", objectNames: ["helmet", "vest"] },
    });
    await AuthorizedObjectsService.createAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("success");
    const doc = await AuthorizedObjects.findOne({ objectType: "ppe" });
    expect(doc.objectNames).toEqual(["helmet", "vest"]);
  });

  it("appends only new object names to an existing record", async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const { req, res, next } = adminCtx({
      body: { objectType: "ppe", objectNames: ["helmet", "gloves"] },
    });
    await AuthorizedObjectsService.createAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("success");
    const doc = await AuthorizedObjects.findOne({ objectType: "ppe" });
    expect(doc.objectNames.sort()).toEqual(["gloves", "helmet"]);
  });

  it("reports when all provided names already exist", async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const { req, res, next } = adminCtx({
      body: { objectType: "ppe", objectNames: ["helmet"] },
    });
    await AuthorizedObjectsService.createAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "0",
      user_email: "no@test.com",
      body: { objectType: "ppe", objectNames: ["x"] },
    });
    await AuthorizedObjectsService.createAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("authorizedObjectsService.fetchAuthorizedObjects", () => {
  beforeEach(async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet", "vest"],
    });
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "tools",
      objectNames: ["drill"],
    });
  });

  it("returns a flat list of all object names when objectTypes is empty", async () => {
    const { req, res, next } = adminCtx({ body: { objectTypes: [] } });
    await AuthorizedObjectsService.fetchAuthorizedObjects(req, res, next);
    expect(payload(res).data.sort()).toEqual(["drill", "helmet", "vest"]);
  });

  it("filters by objectTypes", async () => {
    const { req, res, next } = adminCtx({ body: { objectTypes: ["tools"] } });
    await AuthorizedObjectsService.fetchAuthorizedObjects(req, res, next);
    expect(payload(res).data).toEqual(["drill"]);
  });

  it("rejects a non-array objectTypes", async () => {
    const { req, res, next } = adminCtx({ body: { objectTypes: "ppe" } });
    await AuthorizedObjectsService.fetchAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("authorizedObjectsService.getAllObjectTypes", () => {
  it("returns each object type with its id", async () => {
    await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const { req, res, next } = adminCtx();
    await AuthorizedObjectsService.getAllObjectTypes(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data[0].objectType).toBe("ppe");
  });
});

describe("authorizedObjectsService.updateAuthorizedObjects", () => {
  it("updates the object names of an existing record", async () => {
    const rec = await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const { req, res, next } = adminCtx({
      body: { _id: rec._id.toString(), objectNames: ["helmet", "vest"] },
    });
    await AuthorizedObjectsService.updateAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("success");
    expect((await AuthorizedObjects.findById(rec._id)).objectNames).toEqual([
      "helmet",
      "vest",
    ]);
  });

  it("fails for an unknown record", async () => {
    const { req, res, next } = adminCtx({
      body: { _id: new mongoose.Types.ObjectId().toString(), objectNames: ["x"] },
    });
    await AuthorizedObjectsService.updateAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("authorizedObjectsService.deleteAuthorizedObjects", () => {
  it("deletes an authorized-objects record", async () => {
    const rec = await AuthorizedObjects.create({
      admin: admin._id,
      objectType: "ppe",
      objectNames: ["helmet"],
    });
    const { req, res, next } = adminCtx({ query: { id: rec._id.toString() } });
    await AuthorizedObjectsService.deleteAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(await AuthorizedObjects.findById(rec._id)).toBeNull();
  });

  it("reports when nothing was deleted", async () => {
    const { req, res, next } = adminCtx({
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await AuthorizedObjectsService.deleteAuthorizedObjects(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
