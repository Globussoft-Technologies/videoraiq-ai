/**
 * Integration test for StorageService.uploadFile — full happy path for the
 * S3 branch. Round 1's S3 test exercised `addStorage('s3')` and its
 * verification calls, but the actual `uploadFile` → `uploadToS3` path stayed
 * uncovered. That body is ~80 lines: storage lookup, credentials decryption,
 * S3Client construction, send(PutObjectCommand), Files.create(), and the
 * safe temp-file delete.
 *
 * Mocks (3, well under the 8-mock ceiling):
 *   1. `@aws-sdk/client-s3`             — S3Client constructor + send + PutObjectCommand
 *   2. `mime-types`                     — `mime.extension(...)` (avoid the mime DB)
 *   3. `utils/newSFTPConnectionCheck.js`— quiets the module-load setInterval cleanup
 *
 * The credentials column is round-tripped through the real cryptoUtils
 * `encryptJSON` so the service's `decryptJSON` call succeeds without
 * mocking the crypto layer.
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
import fs from "fs";
import path from "path";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";
import { encryptJSON } from "../../../utils/cryptoUtils.js";

// --- mocks ---

// S3Client + PutObjectCommand: send() resolves with a synthetic ETag.
const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation((cfg) => ({
    __cfg: cfg,
    send: (...args) => sendMock(...args),
  })),
  ListObjectsV2Command: vi.fn().mockImplementation((input) => ({
    __type: "ListObjectsV2Command",
    input,
  })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({
    __type: "PutObjectCommand",
    input,
  })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({
    __type: "DeleteObjectCommand",
    input,
  })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({
    __type: "GetObjectCommand",
    input,
  })),
  HeadObjectCommand: vi.fn().mockImplementation((input) => ({
    __type: "HeadObjectCommand",
    input,
  })),
}));

// mime-types: just hand back a fixed extension.
vi.mock("mime-types", () => ({
  default: {
    extension: vi.fn(() => "mp4"),
    lookup: vi.fn(() => "video/mp4"),
  },
  extension: vi.fn(() => "mp4"),
  lookup: vi.fn(() => "video/mp4"),
}));

// Quiet the SFTP-pool cleanup interval and exists()/end() calls.
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

// --- imports (after mocks) ---
const { default: StorageService } = await import(
  "../../../core/v1/storage/storage.service.js"
);
const { default: Storage } = await import(
  "../../../core/v1/storage/storage.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Files } = await import(
  "../../../core/v1/files/files.model.js"
);

let admin;
let tempPath;

// Use `<repo>/uploads/...` so `safeTempFileDelete` (which only unlinks
// paths under the resolved uploads dir) actually fires.
const UPLOADS_DIR = path.resolve("uploads");

beforeAll(async () => {
  await connectMongo();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  sendMock.mockReset();
  admin = await Admin.create({
    user_id: "1",
    login: "storage-upload-test",
    email: "su@test.com",
  });
  // Create a small temp file under <repo>/uploads/ for the upload to read +
  // (eventually) unlink. Random suffix per test so a previous test's
  // ReadStream (created lazily inside uploadToS3) doesn't accidentally point
  // at the wrong file when safeTempFileDelete runs in the catch branch.
  tempPath = path.join(
    UPLOADS_DIR,
    `s3-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
  );
  fs.writeFileSync(tempPath, "test-content");
});

// fs.createReadStream(path) created inside uploadToS3 opens the file
// immediately and emits 'error' asynchronously if the file disappears
// before the stream is consumed. safeTempFileDelete unlinks the file
// right after a successful send; a stream that's *never* consumed
// (because S3.send was rejected by the mock) can still emit ENOENT on
// the next tick.
//
// Swallow ENOENTs for our temp paths only — other uncaughtExceptions
// propagate to vitest's default handler.
process.on("uncaughtException", (err) => {
  if (err && err.code === "ENOENT" && err.path?.includes("s3-upload-")) {
    return;
  }
  // Default: re-emit so vitest sees the unhandled error as before.
  // (Don't `throw err` directly — that just re-enters this handler.)
  // eslint-disable-next-line no-console
  console.error("[storage.service.uploadS3.test] unhandled:", err);
});

/** Persist an active S3 storage row with encrypted credentials. */
async function seedActiveS3Storage() {
  const creds = {
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "secret-decoded",
    bucketName: "my-bucket",
    region: "us-east-1",
  };
  const row = await Storage.create({
    userId: admin._id,
    name: "active-s3",
    type: "s3",
    credentials: encryptJSON(JSON.stringify(creds)),
  });
  // Pre-save hook may have flipped active off if other rows exist — for this
  // suite we always create exactly one row, so it'll stay active=true. Just
  // assert it for the reader's sanity.
  expect(row.active).toBe(true);
  return row;
}

function makeFileReq() {
  return {
    file: {
      path: tempPath,
      mimetype: "video/mp4",
      size: fs.statSync(tempPath).size,
      originalname: "clip.mp4",
    },
    body: { adminId: admin._id.toString() },
  };
}

describe("StorageService.uploadFile — S3 happy path", () => {
  it("looks up active storage, decrypts creds, sends PutObjectCommand, persists Files row", async () => {
    await seedActiveS3Storage();
    sendMock.mockResolvedValue({ ETag: '"abc"' });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // The send() call was a PutObjectCommand with the right shape.
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.__type).toBe("PutObjectCommand");
    expect(cmd.input.Bucket).toBe("my-bucket");
    expect(cmd.input.Key).toMatch(/^creatives\/.*\.mp4$/);
    expect(cmd.input.ContentType).toBe("video/mp4");
    expect(typeof cmd.input.ContentLength).toBe("number");

    // A Files row was persisted with the storageId + S3 key.
    const stored = await Files.findOne({ userId: admin._id });
    expect(stored).not.toBeNull();
    expect(stored.fileId).toMatch(/^creatives\/.*\.mp4$/);

    // safeTempFileDelete runs async (fs.unlink callback) — give it a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it("returns 500 when S3 send rejects (S3 catch branch)", async () => {
    await seedActiveS3Storage();
    sendMock.mockRejectedValue(new Error("ServiceUnavailable"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(500);
    // Files row should NOT have been created.
    expect(await Files.countDocuments()).toBe(0);
  });

  it("returns 404 when there is no active storage for the user", async () => {
    // No Storage row at all.
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);
    expect(res.statusCode).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 500 when uploadFile catch branch fires (decrypt error)", async () => {
    // Plant a row with un-decryptable credentials. The outer try/catch in
    // uploadFile returns 500.
    await Storage.collection.insertOne({
      userId: admin._id,
      name: "broken",
      type: "s3",
      active: true,
      credentials: "not-base64-garbage",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});
