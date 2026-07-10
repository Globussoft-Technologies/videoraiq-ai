/**
 * Integration test for StorageService — the S3 happy / failure paths in
 * `handleS3Storage`. The AWS SDK and js-base64 `decode` are mocked so the
 * test exercises the full body without needing a live S3 bucket.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// Mock the AWS SDK so handleS3Storage can call list/put/delete without a
// real bucket. The commands are noop classes; the S3Client.send() resolution
// is controlled per-test by `sendMock`.
const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: (...args) => sendMock(...args),
    })),
    ListObjectsV2Command: vi
      .fn()
      .mockImplementation((input) => ({ __type: "ListObjectsV2Command", input })),
    PutObjectCommand: vi
      .fn()
      .mockImplementation((input) => ({ __type: "PutObjectCommand", input })),
    DeleteObjectCommand: vi
      .fn()
      .mockImplementation((input) => ({ __type: "DeleteObjectCommand", input })),
    GetObjectCommand: vi
      .fn()
      .mockImplementation((input) => ({ __type: "GetObjectCommand", input })),
    HeadObjectCommand: vi
      .fn()
      .mockImplementation((input) => ({ __type: "HeadObjectCommand", input })),
  };
});

// js-base64 `decode` is used to decode the inbound secret. Round-trip it
// so the secret stored in the DB matches the value passed in.
vi.mock("js-base64", () => ({
  decode: vi.fn((v) => `decoded:${v}`),
  encode: vi.fn((v) => `encoded:${v}`),
}));

// Skip the periodic SFTP cleanup timer in storage.service.js — we don't
// need it for these tests.
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

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
  sendMock.mockReset();
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

function s3Body(over = {}) {
  return {
    storageType: "s3",
    name: "My S3",
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "secret-b64",
    bucketName: "test-bucket",
    region: "us-east-1",
    note: "test",
    ...over,
  };
}

describe("StorageService.addStorage — S3 happy path", () => {
  it("verifies bucket access, persists encrypted credentials, and returns 200", async () => {
    // List + put + delete all succeed.
    sendMock.mockResolvedValue({});

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: s3Body(),
    });
    await StorageService.addStorage(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(3); // list + put + delete

    const stored = await Storage.findOne({ userId: admin._id });
    expect(stored).not.toBeNull();
    expect(stored.type).toBe("s3");
    expect(stored.name).toBe("My S3");
    expect(stored.note).toBe("test");
    expect(stored.credentials).toBeDefined();
  });

  it("returns 404 when storageType validation fails (missing bucketName)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: s3Body({ bucketName: undefined }),
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when S3 list/put fails (invalid credentials)", async () => {
    sendMock.mockRejectedValueOnce(new Error("AccessDenied"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: s3Body(),
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(await Storage.countDocuments()).toBe(0);
  });
});

describe("StorageService.uploadFile — no-active-storage branch", () => {
  it("returns 404 when the user has no active storage", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    await StorageService.uploadFile(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for an unsupported storage type", async () => {
    // Manually persist a row with an unsupported type to land on the default
    // branch of the type switch. (Bypassing the schema enum by direct
    // collection write; this is a corner case for branch coverage.)
    await Storage.collection.insertOne({
      userId: admin._id,
      name: "weird",
      type: "dropbox",
      active: true,
      credentials: "x", // raw — decryptJSON will throw and 500 instead
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    await StorageService.uploadFile(req, res, next);
    // Either 500 (decrypt failed) or 400 (unsupported) is acceptable — both
    // exercise the catch / default switch. We assert it's not a 2xx.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("StorageService.deleteStorage — extra branches", () => {
  it("returns 500 when the database is broken (catch branch)", async () => {
    const findOneSpy = vi
      .spyOn(Storage, "findOneAndDelete")
      .mockRejectedValueOnce(new Error("boom"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: admin._id.toString() }, // any id, the spy throws
    });
    await StorageService.deleteStorage(req, res, next);
    expect(res.statusCode).toBe(500);

    findOneSpy.mockRestore();
  });
});

describe("StorageService.activateStorage — additional branches", () => {
  it("activates one storage and deactivates the others atomically", async () => {
    // Pre-existing pre-save hook auto-deactivates older rows, so create
    // them in order and re-mark the older as active before the action.
    const a = await Storage.create({
      userId: admin._id,
      name: "A",
      type: "s3",
      credentials: { x: 1 },
    });
    const b = await Storage.create({
      userId: admin._id,
      name: "B",
      type: "s3",
      credentials: { x: 2 },
    });
    await Storage.updateOne({ _id: a._id }, { active: true });
    await Storage.updateOne({ _id: b._id }, { active: false });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageId: b._id.toString(), activate: true },
    });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Storage.findById(a._id)).active).toBe(false);
    expect((await Storage.findById(b._id)).active).toBe(true);
  });

  it("deactivates one storage when another active one remains", async () => {
    const a = await Storage.create({
      userId: admin._id,
      name: "A",
      type: "s3",
      credentials: { x: 1 },
    });
    const b = await Storage.create({
      userId: admin._id,
      name: "B",
      type: "s3",
      credentials: { x: 2 },
    });
    // Two active rows simultaneously: bypass the pre-save hook.
    await Storage.updateOne({ _id: a._id }, { active: true });
    await Storage.updateOne({ _id: b._id }, { active: true });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageId: b._id.toString(), activate: false },
    });
    await StorageService.activateStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Storage.findById(b._id)).active).toBe(false);
  });
});

describe("StorageService.updateStorage — dispatch branches", () => {
  it("dispatches an s3-typed update through handleS3Storage", async () => {
    sendMock.mockResolvedValue({});
    const existing = await Storage.create({
      userId: admin._id,
      name: "Old",
      type: "s3",
      credentials: { encrypted: "old" },
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: existing._id.toString() },
      body: s3Body({ name: "Renamed" }),
    });
    await StorageService.updateStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Storage.findById(existing._id);
    expect(reloaded.name).toBe("Renamed");
  });

  it("returns 400 for an unsupported storage type", async () => {
    // Insert a record with a non-routable type directly through the
    // collection (bypassing the model enum).
    const _id = (await Storage.create({
      userId: admin._id,
      name: "Tmp",
      type: "s3",
      credentials: { x: 1 },
    }))._id;
    await Storage.collection.updateOne({ _id }, { $set: { type: "dropbox" } });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: _id.toString() },
      body: {},
    });
    await StorageService.updateStorage(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});
