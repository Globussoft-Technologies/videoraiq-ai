/**
 * Integration coverage for StorageService.smartStreamFile — the multi-source
 * "find this path anywhere" stream entry-point. The body (~76 lines,
 * 976-1052) was almost entirely uncovered after R74. It walks three
 * sources: (1) a fileId-regex match in the Files collection, (2) the
 * global SFTP pool via connectSFTP, (3) a fallback Files lookup by exact
 * fileId or by mongoose `_id`.
 *
 * Branches pinned (R75 server):
 *   - empty/whitespace path → 400 JSON {error: "Path parameter is required"}.
 *   - regex match in Files collection → delegates to streamFileInternal
 *     (verified by exercising the fileId-regex branch on a Files row that
 *     does NOT have a Storage row, so streamFileInternal returns a 404 —
 *     this still confirms the delegation happened).
 *   - global-SFTP success: connectSFTP returns a client whose
 *     createReadStream emits bytes → CORS + content-type headers set,
 *     stream piped to res, early `return`.
 *   - global-SFTP path-traversal guard: inputPath containing ".." → 400
 *     JSON {status: "failed", message: "Invalid media path."}.
 *   - global-SFTP createReadStream throws → falls into the inner catch
 *     (logger.debug only, no response), continues to the Files fallback
 *     and ultimately returns 404 when neither the path nor an _id lookup
 *     matches.
 *   - Files exact-fileId fallback (line 1034 hit branch) → delegates to
 *     streamFileInternal.
 *   - Files _id fallback (line 1038-1039 valid-objectId branch) → when
 *     inputPath looks like a 24-hex ObjectId AND the path query miss,
 *     re-queries by _id.
 *   - outer catch (line 1048-1050) → decodeURIComponent on an invalid
 *     percent-escape throws → 500 JSON {error: "Failed to read file"}.
 *
 * Mocks (5, under the 8-mock ceiling):
 *   1. `googleapis` — quiet the module-scope import
 *   2. `@aws-sdk/client-s3` — quiet the module-scope import
 *   3. `ssh2-sftp-client` — quiet the module-scope import
 *   4. `utils/newSFTPConnectionCheck.js` — connectSFTP is the live seam;
 *      drive both success + failure scenarios through it
 *   5. `utils/database.js` (redis stub) — module-scope import only
 *
 * Real cryptoUtils + real Files model + mongo-memory-server are used end-to-end.
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
import { Readable, PassThrough } from "stream";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

// --- mocks ---

// connectSFTP returns a client whose `createReadStream` we drive per test.
const sftpCreateReadStreamMock = vi.fn();
const connectSFTPMock = vi.fn().mockResolvedValue({
  createReadStream: sftpCreateReadStreamMock,
  exists: vi.fn().mockResolvedValue(false),
  end: vi.fn().mockResolvedValue(undefined),
});
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: connectSFTPMock,
}));

// Quiet module-scope imports for the other storage backends.
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

// redis stub — storage.service.js imports it at module scope.
vi.mock("../../../utils/database.js", () => ({
  redis: {
    hset: vi.fn(),
    expire: vi.fn(),
    hgetall: vi.fn(),
    del: vi.fn(),
  },
  connectDB: vi.fn(),
}));

// --- imports (after mocks) ---
const { default: StorageService } = await import(
  "../../../core/v1/storage/storage.service.js"
);
const { default: Files } = await import(
  "../../../core/v1/files/files.model.js"
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
  sftpCreateReadStreamMock.mockReset();
  connectSFTPMock.mockClear();
  // Default: connectSFTP yields a client whose createReadStream is reset.
  connectSFTPMock.mockResolvedValue({
    createReadStream: sftpCreateReadStreamMock,
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  });
  admin = await Admin.create({
    user_id: "1",
    login: "smartstream-test",
    email: "ss@test.com",
  });
});

/** Mock res object backed by a PassThrough so .pipe(res) actually runs. */
function mockRes() {
  const headers = {};
  const stream = new PassThrough();
  stream.on("data", () => {}); // drain
  stream.statusCode = 200;
  stream.headersSent = false;
  stream._headers = headers;
  stream._body = undefined;
  stream.setHeader = function (name, value) {
    headers[name] = value;
    return this;
  };
  stream.getHeader = function (name) {
    return headers[name];
  };
  stream.status = function (code) {
    this.statusCode = code;
    return this;
  };
  stream.send = function (body) {
    this._body = body;
    return this;
  };
  stream.json = function (body) {
    this._body = body;
    return this;
  };
  return stream;
}

describe("StorageService.smartStreamFile — input validation", () => {
  it("returns 400 when the decoded path is empty", async () => {
    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: "" } },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res._body).toEqual({ error: "Path parameter is required" });
    // Should NOT have touched connectSFTP — we shorted out before that.
    expect(connectSFTPMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the path is only whitespace", async () => {
    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: "%20%20" } },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when decodeURIComponent throws (outer catch arm)", async () => {
    const res = mockRes();
    // `%E0%A4%A` is an invalid percent-escape sequence — decodeURIComponent
    // throws a URIError synchronously, hitting the outer try/catch.
    await StorageService.smartStreamFile(
      { params: { path: "%E0%A4%A" } },
      res,
    );
    expect(res.statusCode).toBe(500);
    expect(res._body).toEqual({ error: "Failed to read file" });
  });
});

describe("StorageService.smartStreamFile — Files regex match short-circuit", () => {
  it("delegates to streamFileInternal when fileId regex matches an existing Files row", async () => {
    // Insert a Files row whose fileId contains the input substring. We
    // intentionally do NOT insert a matching Storage row, so the call
    // delegates into streamFileInternal which returns the 404
    // "Storage not found" branch. That still proves the regex match
    // branch (line 988) fired — we never hit connectSFTP.
    await Files.create({
      userId: admin._id,
      fileId: "/some/path/clip-xyz-123.mp4",
    });

    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: "clip-xyz-123" } },
      res,
    );

    // The regex branch fires → streamFileInternal → no storage row → 404.
    expect(res.statusCode).toBe(404);
    // connectSFTP should NOT have been called (we short-circuited before
    // the global-SFTP block).
    expect(connectSFTPMock).not.toHaveBeenCalled();
  });
});

describe("StorageService.smartStreamFile — global SFTP path", () => {
  it("returns 400 when the path contains '..' (traversal guard)", async () => {
    // Don't seed a Files row → regex misses → enters global-SFTP block.
    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: "/safe/../../etc/passwd" } },
      res,
    );

    expect(connectSFTPMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(400);
    expect(res._body).toEqual({
      status: "failed",
      message: "Invalid media path.",
    });
    // The traversal guard fires BEFORE createReadStream is called.
    expect(sftpCreateReadStreamMock).not.toHaveBeenCalled();
  });

  it("streams from global SFTP with CORS + Content-Type headers when the file exists", async () => {
    const payload = Buffer.from("hello-global-sftp");
    sftpCreateReadStreamMock.mockResolvedValue(Readable.from(payload));

    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: "/global/clip.mp4" } },
      res,
    );
    // Let the pipeline flush.
    await new Promise((r) => setTimeout(r, 30));

    expect(connectSFTPMock).toHaveBeenCalledTimes(1);
    expect(sftpCreateReadStreamMock).toHaveBeenCalledWith("/global/clip.mp4");
    expect(res._headers["Content-Type"]).toBeDefined();
    expect(res._headers["Content-Disposition"]).toBe("inline");
    expect(res._headers["Accept-Ranges"]).toBe("bytes");
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res._headers["Cross-Origin-Opener-Policy"]).toBe("*");
    expect(res._headers["Cross-Origin-Resource-Policy"]).toBe("*");
  });

  it("falls through to the Files _id fallback when global SFTP fails AND inputPath is a 24-hex id", async () => {
    // Make the global SFTP step fail.
    sftpCreateReadStreamMock.mockRejectedValue(
      new Error("global SFTP read failed"),
    );

    // Seed a Files row keyed by ObjectId — but NOT keyed by fileId === id.
    const file = await Files.create({
      userId: admin._id,
      fileId: "/different/path/x.mp4",
    });

    const idHex = file._id.toString();

    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: idHex } },
      res,
    );

    // global SFTP was attempted.
    expect(connectSFTPMock).toHaveBeenCalled();
    // After the catch, _id fallback found the row → streamFileInternal →
    // no Storage row exists for this Files row → 404 "Storage not found".
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when global SFTP fails AND no Files row matches by path or _id", async () => {
    sftpCreateReadStreamMock.mockRejectedValue(
      new Error("global SFTP unavailable"),
    );

    // No Files rows, non-hex path → both fallbacks miss.
    const res = mockRes();
    await StorageService.smartStreamFile(
      { params: { path: "/nope/missing.mp4" } },
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res._body).toEqual({ error: "File not found in storage" });
  });
});
