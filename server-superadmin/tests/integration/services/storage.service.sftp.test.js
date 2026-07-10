/**
 * Integration test for StorageService — the SFTP add / update branches in
 * `handleSFTPStorage`. ssh2-sftp-client `Client` is mocked so the test
 * exercises the full body (validator, round-trip exists/put/delete, encrypt,
 * persist) without needing a live SFTP server.
 *
 * Mocks: 4 — ssh2-sftp-client, js-base64, the periodic SFTP cleanup connector,
 * and the AWS SDK (loaded at module scope by storage.service.js but unused here).
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

// ssh2-sftp-client mock: per-test we can flip `existsResult` / make put fail.
let existsResult = true;
let putShouldThrow = false;
const sftpInstanceMocks = [];
function makeSftpInstance() {
  const inst = {
    connect: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async () => existsResult),
    put: vi.fn().mockImplementation(async () => {
      if (putShouldThrow) throw new Error("upload denied");
      return undefined;
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  };
  sftpInstanceMocks.push(inst);
  return inst;
}
vi.mock("ssh2-sftp-client", () => ({
  default: vi.fn().mockImplementation(() => makeSftpInstance()),
}));

vi.mock("js-base64", () => ({
  decode: vi.fn((v) => `decoded:${v}`),
  encode: vi.fn((v) => `encoded:${v}`),
}));

// AWS SDK is imported at module scope but the SFTP tests never hit it.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));

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
  existsResult = true;
  putShouldThrow = false;
  sftpInstanceMocks.length = 0;
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

function sftpBody(over = {}) {
  return {
    storageType: "sftp",
    name: "My SFTP",
    host: "sftp.example.com",
    port: 22,
    username: "u",
    password: "cGFzc3dvcmQ=", // arbitrary string the mocked decode runs over
    path: "/uploads",
    note: "test",
    ...over,
  };
}

describe("StorageService.addStorage — SFTP happy path", () => {
  it("verifies the path round-trip, persists encrypted credentials, and returns 200", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: sftpBody(),
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");

    // The sftp client must have connected, checked the folder, uploaded a
    // test file, and deleted it.
    const sftp = sftpInstanceMocks[0];
    expect(sftp.connect).toHaveBeenCalledTimes(1);
    expect(sftp.exists).toHaveBeenCalledWith("/uploads");
    expect(sftp.put).toHaveBeenCalledTimes(1);
    expect(sftp.delete).toHaveBeenCalledTimes(1);
    expect(sftp.end).toHaveBeenCalledTimes(1);

    // Storage row persisted with encrypted credentials and type=sftp.
    const stored = await Storage.findOne({ userId: admin._id });
    expect(stored).toBeTruthy();
    expect(stored.type).toBe("sftp");
    expect(stored.name).toBe("My SFTP");
    expect(typeof stored.credentials).toBe("string");
    expect(stored.credentials.length).toBeGreaterThan(0);
  });
});

describe("StorageService.addStorage — SFTP validation / verification failures", () => {
  it("returns 404 when the body fails Joi validation (missing required field)", async () => {
    const body = sftpBody();
    delete body.host;
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body,
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(404);
    expect(payload(res).status).toBe("failed");
    // Nothing persisted.
    expect(await Storage.countDocuments()).toBe(0);
  });

  it("returns 400 when the SFTP path does not exist on the server", async () => {
    existsResult = false;
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: sftpBody(),
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
    // SFTP session was cleaned up even on failure.
    expect(sftpInstanceMocks[0].end).toHaveBeenCalled();
    expect(await Storage.countDocuments()).toBe(0);
  });

  it("returns 400 when the round-trip file operations throw", async () => {
    putShouldThrow = true;
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: sftpBody(),
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
    expect(sftpInstanceMocks[0].end).toHaveBeenCalled();
    expect(await Storage.countDocuments()).toBe(0);
  });
});

describe("StorageService.updateStorage — SFTP dispatch", () => {
  it("re-uses handleSFTPStorage to update an existing SFTP storage", async () => {
    // Seed an SFTP storage first via the happy path.
    {
      const { req, res, next } = serviceCtx({
        adminId: admin._id,
        body: sftpBody({ name: "Old" }),
      });
      await StorageService.addStorage(req, res, next);
      expect(res.statusCode).toBe(200);
    }
    const existing = await Storage.findOne({ userId: admin._id });
    expect(existing).toBeTruthy();

    // Now update — supply the existing _id via the params.
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: existing._id.toString() },
      body: sftpBody({ name: "Renamed" }),
    });
    await StorageService.updateStorage(req, res, next);
    expect(res.statusCode).toBe(200);

    const updated = await Storage.findById(existing._id);
    expect(updated.name).toBe("Renamed");
  });

  it("returns 404 when updateStorage targets a missing record", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: "000000000000000000000099" },
      body: sftpBody(),
    });
    await StorageService.updateStorage(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
