/**
 * Integration test for StorageService — the CRUD/activation paths against
 * in-memory MongoDB. The S3 / Google Drive / SFTP provider integrations and
 * file streaming are not exercised (they need live external services).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

const { default: StorageService } = await import(
  "../../../core/v1/storage/storage.service.js"
);
const { default: Storage } = await import(
  "../../../core/v1/storage/storage.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

function seedStorage(over = {}) {
  return Storage.create({
    userId: admin._id,
    name: "My Storage",
    type: "s3",
    credentials: { encrypted: "x" },
    ...over,
  });
}

describe("StorageService.addStorage", () => {
  it("returns 400 when storageType is missing", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {} });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown storageType", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageType: "dropbox" },
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("StorageService.getStorages", () => {
  it("returns an empty list for a user with no storages", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await StorageService.getStorages(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.total).toBe(0);
  });

  it("returns the user's storages with a total", async () => {
    await seedStorage();
    await seedStorage({ name: "Second" });
    const { req, res, next } = serviceCtx({ adminId: admin._id, query: {} });
    await StorageService.getStorages(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.total).toBe(2);
  });
});

describe("StorageService.deleteStorage", () => {
  it("returns 400 when the storage id is missing", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, params: {} });
    await StorageService.deleteStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("refuses to delete an active storage", async () => {
    const storage = await seedStorage({ active: true });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: storage._id.toString() },
    });
    await StorageService.deleteStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("deletes an inactive storage", async () => {
    const storage = await seedStorage({ active: false });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: storage._id.toString() },
    });
    await StorageService.deleteStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Storage.findById(storage._id)).toBeNull();
  });
});

describe("StorageService.activateStorage", () => {
  it("returns 400 for a missing storageId / activate flag", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, body: {} });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the user has no storages", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageId: new mongoose.Types.ObjectId().toString(), activate: true },
    });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for an unknown storageId", async () => {
    await seedStorage();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageId: new mongoose.Types.ObjectId().toString(), activate: true },
    });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("activates a storage", async () => {
    const storage = await seedStorage({ active: false });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageId: storage._id.toString(), activate: true },
    });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Storage.findById(storage._id)).active).toBe(true);
  });

  it("refuses to deactivate the only active storage", async () => {
    const storage = await seedStorage({ active: true });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageId: storage._id.toString(), activate: false },
    });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("StorageService.updateStorage", () => {
  it("returns 400 when the storage id is missing", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id, params: {} });
    await StorageService.updateStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown storage", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await StorageService.updateStorage(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
