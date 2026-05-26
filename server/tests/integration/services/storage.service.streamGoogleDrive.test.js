/**
 * Integration coverage for StorageService.streamFromGoogleDrive — the
 * Google Drive streaming branches (~70 lines, lines 1090-1160) which were
 * completely uncovered. The existing googleAuth.test.js exercises the
 * OAuth url + callback + service-account paths, but the *file-streaming*
 * surface (drive.files.get for metadata + drive.files.get for body
 * stream + 200 / 206 / 500 response branches) stayed at 0%.
 *
 * Branches pinned:
 *   - No `range` header → 200 OK with Content-Length from metadata,
 *     full-file pipe to res
 *   - `range: bytes=START-END` header → 206 Partial Content with
 *     Content-Range = `bytes START-END/SIZE`, Content-Length = chunkSize,
 *     the GetObjectCommand-equivalent drive.files.get call carries the
 *     `Range: bytes=START-END` request header
 *   - `range: bytes=START-` (omitted upper bound) → end clamps to
 *     fileSize-1 (same fallback as streamFromS3)
 *   - drive.files.get rejects → catch arm fires, `res.status(500).send`
 *     when headers were NOT yet sent
 *   - drive.files.get rejects AFTER writeHead → catch arm fires but
 *     does NOT touch the response (no double-send)
 *
 * Mocks (5, well under the 8-mock ceiling):
 *   1. `googleapis` — google.auth.OAuth2 + google.drive (files.get)
 *   2. `@aws-sdk/client-s3` — quiet the module-scope import
 *   3. `ssh2-sftp-client` — quiet the module-scope import
 *   4. `utils/newSFTPConnectionCheck.js` — quiet the sftp-cleanup interval
 *   5. `utils/database.js` (redis stub) — module-scope import only;
 *      streamFromGoogleDrive itself doesn't touch redis
 *
 * The service is invoked directly via `StorageService.streamFromGoogleDrive`
 * with synthetic creds, so we don't need to seed a real Storage row.
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

// googleapis: drive.files.get is called twice in each happy-path branch —
// once for metadata (returns {data:{mimeType,size}}), once for the body
// stream (returns {data: <Readable>}). The order of calls inside the
// service is "metadataPromise first, then stream", but our mock is
// invocation-order based so we drive that explicitly per test.
const filesGetMock = vi.fn();
const driveFactoryMock = vi.fn(() => ({
  files: {
    get: filesGetMock,
  },
}));
const setCredentialsMock = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: setCredentialsMock,
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
      })),
      JWT: vi.fn().mockImplementation(() => ({})),
    },
    drive: driveFactoryMock,
  },
}));

// Quiet the SFTP module-load cleanup interval + the unused SDK imports.
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  }),
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

// redis stub — storage.service.js imports it at module scope. We don't
// touch redis in streamFromGoogleDrive but the import must resolve.
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

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  filesGetMock.mockReset();
  setCredentialsMock.mockClear();
  driveFactoryMock.mockClear();
});

/**
 * Build a writable mock res backed by a PassThrough so .pipe(res) lifecycle
 * (writeHead → write → finish) actually plays out. Mirrors the helper used
 * in storage.service.streamS3.test.js so behaviour is parity-clean.
 */
function mockRes() {
  const headers = {};
  const stream = new PassThrough();
  stream.on("data", () => {}); // drain
  stream.statusCode = 200;
  stream.headersSent = false;
  stream._headers = headers;
  stream._writeHeadCalls = [];
  stream.writeHead = function (code, hdrs) {
    this.statusCode = code;
    this._writeHeadCalls.push({ code, hdrs });
    Object.assign(headers, hdrs || {});
    this.headersSent = true;
    return this;
  };
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

function gdriveCreds() {
  return {
    clientId: "test-client-id.apps.googleusercontent.com",
    clientSecret: "test-client-secret",
    refresh_token: "1//test-refresh-token",
  };
}

describe("StorageService.streamFromGoogleDrive — full file (no Range header)", () => {
  it("writeHead 200 with Content-Length + Content-Type from metadata; pipes body to res", async () => {
    // Call #1: metadata
    filesGetMock.mockImplementationOnce(async () => ({
      data: { mimeType: "video/mp4", size: "2048" },
    }));
    // Call #2: stream body
    const bodyStream = Readable.from(Buffer.from("hello-gd"));
    filesGetMock.mockImplementationOnce(async () => ({ data: bodyStream }));

    const res = mockRes();
    const req = { headers: {} };

    await StorageService.streamFromGoogleDrive(req, res, gdriveCreds(), "gd-file-1");
    // Give the pipe lifecycle a tick to flush.
    await new Promise((r) => setTimeout(r, 30));

    expect(res.statusCode).toBe(200);
    expect(res._headers["Content-Length"]).toBe("2048");
    expect(res._headers["Content-Type"]).toBe("video/mp4");
    // CORS bag the service always writes:
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res._headers["Cross-Origin-Opener-Policy"]).toBe("unsafe-none");

    // OAuth2 ctor invoked, refresh token wired.
    expect(setCredentialsMock).toHaveBeenCalledWith({ refresh_token: "1//test-refresh-token" });
    // drive.files.get called twice: once for metadata, once for stream.
    expect(filesGetMock).toHaveBeenCalledTimes(2);
    // 2nd call (body) must request a stream and pass supportsAllDrives.
    const [bodyArgs, bodyOpts] = filesGetMock.mock.calls[1];
    expect(bodyArgs).toMatchObject({
      fileId: "gd-file-1",
      alt: "media",
      supportsAllDrives: true,
    });
    expect(bodyOpts).toMatchObject({ responseType: "stream" });
    // No Range header on the stream call when no Range came in.
    expect(bodyOpts.headers).toBeUndefined();
  });
});

describe("StorageService.streamFromGoogleDrive — partial Range request", () => {
  it("writeHead 206 with Content-Range + Content-Length for a byte-range request", async () => {
    filesGetMock.mockImplementationOnce(async () => ({
      data: { mimeType: "video/mp4", size: "1000" },
    }));
    const bodyStream = Readable.from(Buffer.from("partial"));
    filesGetMock.mockImplementationOnce(async () => ({ data: bodyStream }));

    const res = mockRes();
    const req = { headers: { range: "bytes=0-99" } };

    await StorageService.streamFromGoogleDrive(req, res, gdriveCreds(), "gd-file-2");
    await new Promise((r) => setTimeout(r, 30));

    expect(res.statusCode).toBe(206);
    expect(res._headers["Content-Range"]).toBe("bytes 0-99/1000");
    expect(res._headers["Content-Length"]).toBe(100);
    expect(res._headers["Accept-Ranges"]).toBe("bytes");
    expect(res._headers["Content-Type"]).toBe("video/mp4");

    // The stream call forwards Range as a per-request header.
    const [, bodyOpts] = filesGetMock.mock.calls[1];
    expect(bodyOpts).toMatchObject({
      responseType: "stream",
      headers: { Range: "bytes=0-99" },
    });
  });

  it("uses (fileSize - 1) as end when the Range header omits the upper bound", async () => {
    filesGetMock.mockImplementationOnce(async () => ({
      data: { mimeType: "video/mp4", size: "500" },
    }));
    const bodyStream = Readable.from(Buffer.from("rest"));
    filesGetMock.mockImplementationOnce(async () => ({ data: bodyStream }));

    const res = mockRes();
    const req = { headers: { range: "bytes=200-" } };

    await StorageService.streamFromGoogleDrive(req, res, gdriveCreds(), "gd-file-3");
    await new Promise((r) => setTimeout(r, 30));

    expect(res.statusCode).toBe(206);
    // end clamps to fileSize-1 (499); chunkSize = 499 - 200 + 1 = 300.
    expect(res._headers["Content-Range"]).toBe("bytes 200-499/500");
    expect(res._headers["Content-Length"]).toBe(300);

    const [, bodyOpts] = filesGetMock.mock.calls[1];
    expect(bodyOpts.headers).toEqual({ Range: "bytes=200-499" });
  });
});

describe("StorageService.streamFromGoogleDrive — error / catch", () => {
  it("returns 500 'Streaming error' when metadata fetch throws and headers were NOT sent", async () => {
    // First call rejects → catch arm fires before writeHead.
    filesGetMock.mockRejectedValueOnce(new Error("Drive API 503"));

    const res = mockRes();
    res.headersSent = false; // explicit reset
    const req = { headers: {} };

    await StorageService.streamFromGoogleDrive(req, res, gdriveCreds(), "gd-missing");

    expect(res.statusCode).toBe(500);
    expect(res._body).toMatch(/Streaming error/i);
    // Only the one (rejected) call happened.
    expect(filesGetMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT touch the response when headers were already sent before the throw", async () => {
    // Force the second drive.files.get (the body stream) to reject AFTER we
    // emulate `headersSent=true` for the catch-arm guard. We push a metadata
    // success first so the service reaches the stream-fetch call.
    filesGetMock.mockImplementationOnce(async () => ({
      data: { mimeType: "video/mp4", size: "1234" },
    }));
    // Mark headers as already sent before the stream call resolves/rejects.
    // The service calls writeHead before the stream-fetch await would
    // throw — but to deterministically exercise the `if (!res.headersSent)`
    // FALSE branch we set the flag up front and reject the body call.
    filesGetMock.mockRejectedValueOnce(new Error("body fetch failed"));

    const res = mockRes();
    res.headersSent = true; // simulate "already streamed something"
    const req = { headers: {} };

    // Pre-capture the initial statusCode so we can assert "no change" later.
    const before = res.statusCode;
    const beforeBody = res._body;

    await StorageService.streamFromGoogleDrive(req, res, gdriveCreds(), "gd-x");

    // statusCode wasn't bumped to 500 and no body was attached because
    // the catch's `if (!res.headersSent)` guard short-circuited.
    expect(res.statusCode).toBe(before);
    expect(res._body).toBe(beforeBody);
  });
});
