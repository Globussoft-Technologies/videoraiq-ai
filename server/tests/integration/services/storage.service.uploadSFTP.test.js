/**
 * Integration coverage for StorageService.uploadFile → uploadToSFTP branch
 * + the residual error branches of `handleRangeRequest`. After R73-R75
 * (Google Drive / S3 upload paths + SFTP streaming), the SFTP upload body
 * (lines 908-965) was the largest remaining uncovered region in
 * storage.service.js, and `handleRangeRequest`'s catch arms (1311-1316)
 * were untouched.
 *
 * Branches pinned (R76 server):
 *   - uploadFile lookup → sftp case → uploadToSFTP (storage.findOne,
 *     JSON.parse(decryptJSON), switch).
 *   - uploadToSFTP happy path: getSftpClient (cold start), activeRequests
 *     bump in try, sftp.mkdir(baseFolder, true), pipeline(readStream,
 *     sftp.createWriteStream(...)), Files.create persists, safeTempFileDelete
 *     unlinks the temp file, 200 JSON {success, path}.
 *   - uploadToSFTP mkdir "already exists" branch (lines 928-930): mkdir
 *     rejects with an error whose message includes "Failure" → swallowed,
 *     upload continues.
 *   - uploadToSFTP catch arm (lines 955-958 + finally 959-963): mkdir
 *     rejects with a non-"Failure" message → propagates, 500 JSON, no
 *     Files row created, activeRequests still decremented in finally.
 *   - uploadToSFTP `req.body.folderName` override branch: explicit
 *     folderName replaces the "incidents" default in the remote path.
 *   - handleRangeRequest catch arm with ERR_STREAM_PREMATURE_CLOSE
 *     (lines 1311-1312): swallowed silently, no throw.
 *   - handleRangeRequest catch arm with a different error code
 *     (lines 1313-1316): re-thrown out of the function.
 *
 * Mocks (5, under the 8-mock ceiling):
 *   1. `ssh2-sftp-client` — Client class with connect / mkdir /
 *      createWriteStream / on (cleanup wiring).
 *   2. `@aws-sdk/client-s3` — quiet the module-scope import.
 *   3. `googleapis` — quiet the module-scope import.
 *   4. `mime-types` — fixed extension so the remote path is deterministic.
 *   5. `utils/newSFTPConnectionCheck.js` — quiet the module-load
 *      cleanup interval.
 *
 * Real cryptoUtils + real Storage + real Files models + real mongo-memory
 * server are used so storage.findOne, decryptJSON, and Files.create all
 * exercise production code.
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
import { PassThrough, Readable, Writable } from "stream";
import fs from "fs";
import path from "path";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";
import { encryptJSON } from "../../../utils/cryptoUtils.js";

// --- mocks ---

// ssh2-sftp-client: capture the connect call and provide mkdir +
// createWriteStream so the SFTP upload pipeline can complete.
const connectMock = vi.fn().mockResolvedValue(undefined);
const onMock = vi.fn();
const mkdirMock = vi.fn();
const createWriteStreamMock = vi.fn();
const endMock = vi.fn().mockResolvedValue(undefined);
const ClientCtorCalls = [];

class MockSftpClient {
  constructor() {
    ClientCtorCalls.push(this);
    this.on = onMock;
    this.connect = connectMock;
    this.mkdir = mkdirMock;
    this.createWriteStream = createWriteStreamMock;
    this.end = endMock;
  }
}

vi.mock("ssh2-sftp-client", () => ({
  default: MockSftpClient,
}));

// Quiet the AWS SDK + googleapis module-scope imports.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
      })),
      JWT: vi.fn().mockImplementation(() => ({})),
    },
    drive: vi.fn(() => ({ files: { get: vi.fn() } })),
  },
}));

// mime-types: stable extension so we can assert remotePath shape.
vi.mock("mime-types", () => ({
  default: {
    extension: vi.fn(() => "mp4"),
    lookup: vi.fn(() => "video/mp4"),
  },
  extension: vi.fn(() => "mp4"),
  lookup: vi.fn(() => "video/mp4"),
}));

// Quiet the SFTP-pool cleanup interval (module-load side effect).
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

// `safeTempFileDelete` only unlinks paths under <repo>/uploads/, so the
// fixture file must live there too.
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
  connectMock.mockClear();
  onMock.mockClear();
  mkdirMock.mockReset();
  createWriteStreamMock.mockReset();
  endMock.mockClear();
  ClientCtorCalls.length = 0;
  admin = await Admin.create({
    user_id: "1",
    login: "sftp-upload-test",
    email: "su@test.com",
  });
  tempPath = path.join(
    UPLOADS_DIR,
    `sftp-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
  );
  fs.writeFileSync(tempPath, "sftp-content");
});

// fs.createReadStream(req.file.path) created inside uploadToSFTP opens
// the file immediately; if a later test's safeTempFileDelete unlinks
// the file before the stream is fully consumed (mock catch arms etc.)
// an ENOENT can fire on a later tick. Swallow only ENOENTs for our
// temp files.
process.on("uncaughtException", (err) => {
  if (err && err.code === "ENOENT" && err.path?.includes("sftp-upload-")) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[storage.service.uploadSFTP.test] unhandled:", err);
});

/** Persist an active sftp Storage row with encrypted credentials. */
async function seedActiveSftpStorage() {
  const creds = {
    host: "sftp.test.invalid",
    port: 22,
    username: "user",
    password: "pw",
    path: "/incidents",
  };
  const row = await Storage.create({
    userId: admin._id,
    name: "active-sftp",
    type: "sftp",
    credentials: encryptJSON(JSON.stringify(creds)),
  });
  expect(row.active).toBe(true);
  return row;
}

function makeFileReq(extraBody = {}) {
  return {
    file: {
      path: tempPath,
      mimetype: "video/mp4",
      size: fs.statSync(tempPath).size,
      originalname: "clip.mp4",
    },
    body: { adminId: admin._id.toString(), ...extraBody },
  };
}

/**
 * Build a Writable that immediately drains everything piped into it.
 * `pipeline(readStream, mockWritable)` then resolves after EOF.
 */
function makeDrainWritable() {
  return new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
}

describe("StorageService.uploadFile — SFTP happy path", () => {
  it("connects via pool, mkdir's the folder, pipelines the upload, persists Files row, returns 200", async () => {
    const storage = await seedActiveSftpStorage();
    mkdirMock.mockResolvedValue(undefined);
    // createWriteStream returns a writable that drains the read stream so
    // the `pipeline(...)` call inside uploadToSFTP resolves cleanly.
    createWriteStreamMock.mockImplementation(() => makeDrainWritable());

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(200);
    // Body should advertise success + the remote path (under /incidents/incidents/).
    expect(res._body).toMatchObject({ success: true });
    expect(res._body.path).toMatch(/^\/incidents\/incidents\/.+\.mp4$/);

    // A new ssh2-sftp-client was constructed and connected.
    expect(ClientCtorCalls.length).toBe(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    // mkdir was called with the joined base folder + recursive=true.
    expect(mkdirMock).toHaveBeenCalledWith("/incidents/incidents", true);
    // createWriteStream was called with the remote .mp4 path under that folder.
    expect(createWriteStreamMock).toHaveBeenCalledTimes(1);
    const writeArg = createWriteStreamMock.mock.calls[0][0];
    expect(writeArg).toMatch(/^\/incidents\/incidents\/.+\.mp4$/);

    // Files row persisted with the fileId === remote path.
    const stored = await Files.findOne({ userId: admin._id });
    expect(stored).not.toBeNull();
    expect(stored.fileId).toBe(writeArg);
    expect(stored.storageId.toString()).toBe(storage._id.toString());

    // safeTempFileDelete runs async via fs.unlink callback.
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it("uses req.body.folderName when provided instead of the 'incidents' default", async () => {
    await seedActiveSftpStorage();
    mkdirMock.mockResolvedValue(undefined);
    createWriteStreamMock.mockImplementation(() => makeDrainWritable());

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString(), folderName: "recordings" },
    });
    Object.assign(req, makeFileReq({ folderName: "recordings" }));

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(mkdirMock).toHaveBeenCalledWith("/incidents/recordings", true);
    expect(createWriteStreamMock.mock.calls[0][0]).toMatch(
      /^\/incidents\/recordings\/.+\.mp4$/
    );
  });

  it("swallows a mkdir 'Failure' error (already-exists branch) and still uploads", async () => {
    await seedActiveSftpStorage();
    // ssh2-sftp-client's mkdir rejects with a "Failure" message when the
    // directory already exists. The service is supposed to swallow that.
    mkdirMock.mockRejectedValue(new Error("Failure"));
    createWriteStreamMock.mockImplementation(() => makeDrainWritable());

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(200);
    // Upload still ran despite the mkdir failure.
    expect(createWriteStreamMock).toHaveBeenCalledTimes(1);
    // Files row persisted as in the happy path.
    expect(await Files.countDocuments()).toBe(1);
  });
});

describe("StorageService.uploadFile — SFTP error / catch", () => {
  it("returns 500 and skips Files.create when mkdir fails with a non-'Failure' error (catch branch + finally)", async () => {
    await seedActiveSftpStorage();
    // A non-"Failure" message propagates out of the inner try and trips
    // the outer catch. We assert the pool session's bookkeeping in the
    // finally{} block still runs (activeRequests bumped then decremented
    // back to 0).
    mkdirMock.mockRejectedValue(new Error("Permission denied"));

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { adminId: admin._id.toString() },
    });
    Object.assign(req, makeFileReq());

    await StorageService.uploadFile(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res._body).toMatchObject({ error: expect.stringMatching(/SFTP/i) });
    // createWriteStream was NOT reached.
    expect(createWriteStreamMock).not.toHaveBeenCalled();
    // No Files row was persisted.
    expect(await Files.countDocuments()).toBe(0);
    // safeTempFileDelete still ran in the catch — give the unlink a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(tempPath)).toBe(false);

    // The pool session's activeRequests was bumped to 1 inside try and
    // decremented back to 0 in finally{}.
    const session = await StorageService.getSftpClient(
      "doesnt-matter-already-pooled",
      {
        host: "sftp.test.invalid",
        port: 22,
        username: "user",
        password: "pw",
        path: "/incidents",
      },
    );
    expect(session.activeRequests).toBe(0);
  });
});

describe("StorageService.handleRangeRequest — pipeline error branches", () => {
  it("swallows ERR_STREAM_PREMATURE_CLOSE silently (client-abort branch)", async () => {
    // PassThrough that destroys with a synthetic ERR_STREAM_PREMATURE_CLOSE
    // shortly after the pipeline starts. The service is supposed to
    // recognise that code and NOT re-throw.
    const stream = new PassThrough();
    const sftp = {
      createReadStream: vi.fn().mockReturnValue(stream),
    };
    // Build a real Writable as `res` so pipeline has something to drain.
    const res = makeDrainWritable();
    res.statusCode = 200;
    res.headersSent = false;
    res._writeHeadCalls = [];
    res.writeHead = function (code, hdrs) {
      this.statusCode = code;
      this._writeHeadCalls.push({ code, hdrs });
      this.headersSent = true;
      return this;
    };
    res.setHeader = function () {};
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
    res.end = function () {
      return this;
    };

    // Kick off the pipeline and then destroy the source with the
    // prematureClose-style error on the next tick.
    const errAbort = Object.assign(new Error("Premature close"), {
      code: "ERR_STREAM_PREMATURE_CLOSE",
    });
    setImmediate(() => stream.destroy(errAbort));

    // Should resolve WITHOUT throwing — that's the whole point of the
    // ERR_STREAM_PREMATURE_CLOSE branch.
    await expect(
      StorageService.handleRangeRequest(sftp, "/incidents/x.mp4", "bytes=0-49", res, 1000),
    ).resolves.toBeUndefined();

    // The 206 writeHead still ran first.
    expect(res._writeHeadCalls.length).toBe(1);
    expect(res._writeHeadCalls[0].code).toBe(206);
  });

  it("re-throws when the pipeline error is NOT a prematureClose (other-error branch)", async () => {
    const stream = new PassThrough();
    const sftp = {
      createReadStream: vi.fn().mockReturnValue(stream),
    };
    const res = makeDrainWritable();
    res.statusCode = 200;
    res.headersSent = false;
    res._writeHeadCalls = [];
    res.writeHead = function (code, hdrs) {
      this.statusCode = code;
      this._writeHeadCalls.push({ code, hdrs });
      this.headersSent = true;
      return this;
    };
    res.setHeader = function () {};
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
    res.end = function () {
      return this;
    };

    const errBoom = Object.assign(new Error("disk gone"), {
      code: "ENETDOWN",
    });
    setImmediate(() => stream.destroy(errBoom));

    await expect(
      StorageService.handleRangeRequest(sftp, "/incidents/y.mp4", "bytes=0-49", res, 1000),
    ).rejects.toThrow(/disk gone/);

    // The 206 writeHead still ran first.
    expect(res._writeHeadCalls.length).toBe(1);
    expect(res._writeHeadCalls[0].code).toBe(206);
  });
});
