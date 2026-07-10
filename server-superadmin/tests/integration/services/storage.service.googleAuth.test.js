/**
 * Integration coverage for StorageService — the Google Drive OAuth /
 * service-account branches that previous rounds skipped. These bodies make up
 * ~150 lines of currently uncovered storage.service.js:
 *
 *   - googleAuthUrl                : validator → redis.hset/expire → google
 *                                    OAuth2 client → generateAuthUrl → 200
 *   - googleAuthUrl                : validator 404 (missing required field)
 *   - googleAuthUrl                : 500 when redis.hset throws
 *   - googleAuthCallback           : invalid session → 400
 *   - googleAuthCallback           : happy path → redirect, Storage row saved
 *   - googleAuthCallback           : update path (oauthData.updateId set)
 *   - googleAuthCallback           : update path with unknown storage → 404
 *   - addGoogleDriveServiceAccount : no file uploaded → 400
 *   - addGoogleDriveServiceAccount : invalid JSON file → 400
 *   - addGoogleDriveServiceAccount : happy path → 200, Storage row saved
 *   - addStorage dispatch          : "google_drive_oauth" routes to googleAuthUrl
 *   - addStorage dispatch          : "google_drive_service_account" routes to addGoogleDriveServiceAccount
 *
 * Mocks (5, well under the 8-mock ceiling):
 *   1. googleapis            — drive.files.create / .delete + auth.OAuth2 +
 *                              auth.JWT
 *   2. utils/database.js     — `redis` hset/expire/hgetall/del
 *   3. utils/newSFTPConnectionCheck.js — quiet the storage.service load-time
 *                              cleanup interval
 *   4. @aws-sdk/client-s3    — module-scope import in storage.service.js,
 *                              unused here
 *   5. ssh2-sftp-client      — module-scope import, unused here
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
import { serviceCtx } from "../../helpers/service.js";

// --- mocks ---

// google.auth.OAuth2: generate a deterministic URL; getToken returns fixed
// tokens. google.drive: list/create/delete files for the service-account flow.
const generateAuthUrlMock = vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?test=1");
const getTokenMock = vi.fn(async () => ({
  tokens: {
    access_token: "at-test",
    refresh_token: "rt-test",
    expiry_date: 1234567890,
  },
}));
const driveFilesCreateMock = vi.fn(async () => ({ data: { id: "drive-file-1" } }));
const driveFilesDeleteMock = vi.fn(async () => ({}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: generateAuthUrlMock,
        getToken: getTokenMock,
        setCredentials: vi.fn(),
      })),
      JWT: vi.fn().mockImplementation(() => ({})),
    },
    drive: vi.fn(() => ({
      files: {
        create: driveFilesCreateMock,
        delete: driveFilesDeleteMock,
        list: vi.fn(async () => ({ data: { files: [] } })),
        get: vi.fn(),
      },
    })),
  },
}));

// In-memory redis stand-in for hset/expire/hgetall/del.
const redisStore = new Map();
const redisMock = {
  hset: vi.fn(async (key, value) => {
    redisStore.set(key, { ...value });
    return 1;
  }),
  expire: vi.fn(async () => 1),
  hgetall: vi.fn(async (key) => redisStore.get(key) || null),
  del: vi.fn(async (key) => {
    redisStore.delete(key);
    return 1;
  }),
};
vi.mock("../../../utils/database.js", () => ({
  redis: redisMock,
  connectDB: vi.fn(),
}));

// Quiet the SFTP-pool cleanup interval and exists()/end() calls.
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Module-scope import in storage.service.js, unused here.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));

vi.mock("ssh2-sftp-client", () => ({
  default: vi.fn(),
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

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  redisStore.clear();
  redisMock.hset.mockClear();
  redisMock.expire.mockClear();
  redisMock.hgetall.mockClear();
  redisMock.del.mockClear();
  generateAuthUrlMock.mockClear();
  getTokenMock.mockClear();
  driveFilesCreateMock.mockClear();
  driveFilesDeleteMock.mockClear();
  admin = await Admin.create({
    user_id: "1",
    login: "google-auth",
    email: "g@test.com",
  });
});

function googleOAuthBody(over = {}) {
  return {
    storageType: "google_drive_oauth",
    name: "My Google Drive",
    clientId: "client-id-test",
    clientSecret: "client-secret-test",
    redirectUri: "https://app.test/callback",
    note: "primary",
    ...over,
  };
}

describe("StorageService.googleAuthUrl", () => {
  it("returns 200 with an auth URL and stores temp creds in redis", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: googleOAuthBody(),
    });
    await StorageService.googleAuthUrl(req, res, next);

    expect(res.statusCode).toBe(200);
    const url = res._body?.body?.data?.url;
    expect(url).toBe("https://accounts.google.com/o/oauth2/v2/auth?test=1");

    // redis.hset called once with the OAuth context.
    expect(redisMock.hset).toHaveBeenCalledTimes(1);
    const [redisKey, storedCtx] = redisMock.hset.mock.calls[0];
    expect(redisKey).toMatch(/^google_oauth:/);
    expect(storedCtx.clientId).toBe("client-id-test");
    expect(storedCtx.userId).toBe(admin._id.toString());
    expect(storedCtx.name).toBe("My Google Drive");
    expect(storedCtx.note).toBe("primary");

    // expire 5 minutes TTL
    expect(redisMock.expire).toHaveBeenCalledWith(redisKey, 300);

    // generateAuthUrl was called with the expected options.
    expect(generateAuthUrlMock).toHaveBeenCalledTimes(1);
    const opts = generateAuthUrlMock.mock.calls[0][0];
    expect(opts.access_type).toBe("offline");
    expect(opts.prompt).toBe("consent");
    expect(opts.scope).toContain("https://www.googleapis.com/auth/drive.file");
    expect(opts.state).toMatch(/.+/);
  });

  it("returns 404 when validator fails (missing clientId)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: googleOAuthBody({ clientId: undefined }),
    });
    await StorageService.googleAuthUrl(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 500 when redis.hset throws", async () => {
    redisMock.hset.mockRejectedValueOnce(new Error("redis-down"));
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: googleOAuthBody(),
    });
    await StorageService.googleAuthUrl(req, res, next);
    expect(res.statusCode).toBe(500);
  });

  it("propagates note='' default when no note is provided", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: googleOAuthBody({ note: undefined }),
    });
    await StorageService.googleAuthUrl(req, res, next);
    expect(res.statusCode).toBe(200);
    const [, storedCtx] = redisMock.hset.mock.calls[0];
    expect(storedCtx.note).toBe("");
  });
});

describe("StorageService.googleAuthCallback", () => {
  it("returns 400 when the session is unknown", async () => {
    redisMock.hgetall.mockResolvedValueOnce(null);
    const { req, res, next } = serviceCtx({
      query: { code: "auth-code", state: "missing-session" },
    });
    await StorageService.googleAuthCallback(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("happy path: persists a new Storage row + redirects to storagePage", async () => {
    // Pre-seed an OAuth session in redis so the callback finds it.
    redisStore.set("google_oauth:sess-1", {
      clientId: "client-id-test",
      clientSecret: "client-secret-test",
      redirectUri: "https://app.test/cb",
      userId: admin._id.toString(),
      name: "Drive A",
      updateId: "",
      note: "n",
    });

    // Capture redirect target.
    const { req, res, next } = serviceCtx({
      query: { code: "auth-code", state: "sess-1" },
    });
    res.redirect = function (url) {
      this.statusCode = 302;
      this._redirect = url;
      return this;
    };

    await StorageService.googleAuthCallback(req, res, next);

    expect(res._redirect).toBeDefined();
    expect(res._redirect).toMatch(/storage/);

    // Storage row was persisted with the right type and credentials shape.
    const rows = await Storage.find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("google_drive_oauth");
    expect(rows[0].name).toBe("Drive A");

    // The temporary redis session was deleted.
    expect(redisMock.del).toHaveBeenCalledWith("google_oauth:sess-1");
  });

  it("update path: routes to findOneAndUpdate when updateId is set", async () => {
    // Seed an existing storage row first.
    const existing = await Storage.create({
      userId: admin._id,
      name: "Old name",
      type: "google_drive_oauth",
      credentials: { x: 1 },
    });

    redisStore.set("google_oauth:sess-2", {
      clientId: "c",
      clientSecret: "s",
      redirectUri: "https://app.test/cb",
      userId: admin._id.toString(),
      name: "Renamed",
      updateId: existing._id.toString(),
      note: "updated",
    });

    const { req, res, next } = serviceCtx({
      query: { code: "auth-code", state: "sess-2" },
    });
    res.redirect = function (url) {
      this.statusCode = 302;
      this._redirect = url;
      return this;
    };

    await StorageService.googleAuthCallback(req, res, next);
    expect(res._redirect).toBeDefined();

    const reloaded = await Storage.findById(existing._id);
    expect(reloaded.name).toBe("Renamed");
    expect(reloaded.note).toBe("updated");
  });

  it("update path: returns 404 when the storage no longer exists", async () => {
    const fakeId = new (await import("mongoose")).default.Types.ObjectId();
    redisStore.set("google_oauth:sess-3", {
      clientId: "c",
      clientSecret: "s",
      redirectUri: "https://app.test/cb",
      userId: admin._id.toString(),
      name: "Gone",
      updateId: fakeId.toString(),
      note: "",
    });

    const { req, res, next } = serviceCtx({
      query: { code: "auth-code", state: "sess-3" },
    });
    await StorageService.googleAuthCallback(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 500 when google getToken throws (catch branch)", async () => {
    redisStore.set("google_oauth:sess-4", {
      clientId: "c",
      clientSecret: "s",
      redirectUri: "https://app.test/cb",
      userId: admin._id.toString(),
      name: "X",
      updateId: "",
      note: "",
    });
    getTokenMock.mockRejectedValueOnce(new Error("invalid code"));
    const { req, res, next } = serviceCtx({
      query: { code: "bad-code", state: "sess-4" },
    });
    await StorageService.googleAuthCallback(req, res, next);
    expect(res.statusCode).toBe(500);
  });
});

describe("StorageService.addGoogleDriveServiceAccount", () => {
  function saBody() {
    return {
      name: "SA Drive",
    };
  }
  function saFile(json = '{"client_email":"sa@p.iam.gserviceaccount.com","private_key":"PRIV"}') {
    return { buffer: Buffer.from(json, "utf8") };
  }

  it("returns 400 when no file is uploaded", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: saBody(),
    });
    await StorageService.addGoogleDriveServiceAccount(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when the uploaded file is not valid JSON", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: saBody(),
    });
    req.file = { buffer: Buffer.from("not-json", "utf8") };
    await StorageService.addGoogleDriveServiceAccount(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("happy path: verifies via drive.files.create/delete and persists a Storage row", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: saBody(),
    });
    req.file = saFile();
    await StorageService.addGoogleDriveServiceAccount(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(driveFilesCreateMock).toHaveBeenCalledTimes(1);
    expect(driveFilesDeleteMock).toHaveBeenCalledTimes(1);

    const row = await Storage.findOne({ userId: admin._id });
    expect(row).not.toBeNull();
    expect(row.type).toBe("google_drive_service_account");
    expect(row.name).toBe("SA Drive");
  });

  it("returns 500 when drive.files.create throws", async () => {
    driveFilesCreateMock.mockRejectedValueOnce(new Error("Insufficient scope"));
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: saBody(),
    });
    req.file = saFile();
    await StorageService.addGoogleDriveServiceAccount(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(await Storage.countDocuments()).toBe(0);
  });
});

describe("StorageService.addStorage — Google Drive dispatch", () => {
  it("routes 'google_drive_oauth' through googleAuthUrl (returns the same URL payload)", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: googleOAuthBody(),
    });
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body?.body?.data?.url).toMatch(/^https:\/\//);
  });

  it("routes 'google_drive_service_account' through addGoogleDriveServiceAccount", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { storageType: "google_drive_service_account", name: "SA" },
    });
    req.file = { buffer: Buffer.from('{"client_email":"x","private_key":"k"}', "utf8") };
    await StorageService.addStorage(req, res, next);
    expect(res.statusCode).toBe(200);
    const row = await Storage.findOne({ type: "google_drive_service_account" });
    expect(row).not.toBeNull();
  });
});
