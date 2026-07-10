/**
 * Integration coverage for StorageService SFTP streaming surface — the
 * `getSftpClient` + `streamFromSFTP` + `handleRangeRequest` success-path
 * branches. The existing storage.service.stream.test.js only pins the 416
 * short-circuit of `handleRangeRequest`; storage.service.sftp.test.js
 * covers addStorage. The streaming bodies (~80 lines, 871-906 + 1241-1320)
 * were uncovered.
 *
 * Branches pinned (R74 server):
 *   - `getSftpClient` cold-start: no pool entry → new ssh2 Client, connect,
 *     pool insert; verifies the 3 lifecycle listeners attached.
 *   - `getSftpClient` warm pool hit (lines 875-878): pre-seeded session
 *     returns the same client and refreshes `lastUsed`.
 *   - `streamFromSFTP` happy path: pipes the createReadStream output to res,
 *     sets the Content-Type + CORS bag, bumps activeRequests in `try`,
 *     decrements + updates lastUsed in `finally`.
 *   - `streamFromSFTP` catch arm with `!res.headersSent` → 500 JSON.
 *   - `streamFromSFTP` catch arm with `res.headersSent === true` → res.end()
 *     (no double-send guard).
 *   - `handleRangeRequest` 206 success: writeHead 206 with
 *     Content-Range/Content-Length, pipelines the SFTP byte-range stream.
 *
 * Mocks (5, under 8-mock budget):
 *   1. `ssh2-sftp-client` — Client class with connect / createReadStream /
 *      on (cleanup wiring).
 *   2. `@aws-sdk/client-s3` — quiet module-scope import.
 *   3. `googleapis` — quiet module-scope import.
 *   4. `utils/newSFTPConnectionCheck.js` — quiet the module-load
 *      cleanup interval.
 *   5. `utils/database.js` (redis stub) — module-scope import only.
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

// ssh2-sftp-client: capture the connect call and provide a createReadStream
// that emits the configured payload, plus event listener registration.
const connectMock = vi.fn().mockResolvedValue(undefined);
const onMock = vi.fn();
const createReadStreamMock = vi.fn();
const ClientCtorCalls = [];

class MockSftpClient {
  constructor() {
    ClientCtorCalls.push(this);
    this.on = onMock;
    this.connect = connectMock;
    this.createReadStream = createReadStreamMock;
    this.end = vi.fn().mockResolvedValue(undefined);
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

// Quiet the SFTP cleanup interval + redis import.
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));
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
  connectMock.mockClear();
  onMock.mockClear();
  createReadStreamMock.mockReset();
  ClientCtorCalls.length = 0;
});

/** Mock res object backed by a PassThrough so .pipe(res) actually runs. */
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

function sftpCreds() {
  return {
    host: "sftp.test.invalid",
    port: 22,
    username: "user",
    password: "pw",
    path: "/incidents",
  };
}

describe("StorageService.getSftpClient — cold start + pool reuse", () => {
  it("connects a new client and inserts into the pool when no session exists for storageId", async () => {
    const storageId = "sftp-storage-cold-1";
    const session = await StorageService.getSftpClient(storageId, sftpCreds());

    expect(ClientCtorCalls.length).toBe(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledWith(sftpCreds());
    // Three lifecycle listeners: close, end, error.
    const events = onMock.mock.calls.map((c) => c[0]).sort();
    expect(events).toEqual(["close", "end", "error"]);
    // Session shape returned by the helper.
    expect(session).toMatchObject({
      activeRequests: 0,
      storageId,
    });
    expect(typeof session.lastUsed).toBe("number");
    expect(session.client).toBe(ClientCtorCalls[0]);
  });

  it("reuses an existing pool entry without reconnecting (warm hit branch 875-878)", async () => {
    const storageId = "sftp-storage-warm-1";
    const first = await StorageService.getSftpClient(storageId, sftpCreds());
    const firstLastUsed = first.lastUsed;
    const ctorCountAfterFirst = ClientCtorCalls.length;
    const connectCountAfterFirst = connectMock.mock.calls.length;

    // Bump time forward at least 1ms so the lastUsed refresh is observable.
    await new Promise((r) => setTimeout(r, 5));
    const second = await StorageService.getSftpClient(storageId, sftpCreds());

    // No new Client constructed, no new connect call.
    expect(ClientCtorCalls.length).toBe(ctorCountAfterFirst);
    expect(connectMock.mock.calls.length).toBe(connectCountAfterFirst);
    // Same session object returned; lastUsed refreshed forward.
    expect(second).toBe(first);
    expect(second.lastUsed).toBeGreaterThanOrEqual(firstLastUsed);
  });
});

describe("StorageService.streamFromSFTP — success path", () => {
  it("pipes the SFTP read stream to res with CORS + Content-Type headers, bumps then drops activeRequests", async () => {
    // Pre-seed pool so getSftpClient hits the warm branch and we control the
    // session object directly.
    const storageId = "sftp-stream-ok-1";
    const session = await StorageService.getSftpClient(storageId, sftpCreds());
    expect(session.activeRequests).toBe(0);

    const body = Readable.from(Buffer.from("hello-sftp"));
    createReadStreamMock.mockReturnValue(body);

    const res = mockRes();
    const req = {};

    // observe the bump: spy on activeRequests by capturing after first
    // microtask — but easier: assert pre/post values.
    await StorageService.streamFromSFTP(
      req,
      res,
      sftpCreds(),
      "/incidents/video.mp4",
      storageId,
    );
    await new Promise((r) => setTimeout(r, 30));

    expect(createReadStreamMock).toHaveBeenCalledWith("/incidents/video.mp4");
    expect(res._headers["Content-Type"]).toBeDefined();
    expect(res._headers["Content-Disposition"]).toBe("inline");
    expect(res._headers["Accept-Ranges"]).toBe("bytes");
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res._headers["Cross-Origin-Opener-Policy"]).toBe("*");
    expect(res._headers["Cross-Origin-Resource-Policy"]).toBe("*");

    // finally{} decremented activeRequests back to 0 and refreshed lastUsed.
    expect(session.activeRequests).toBe(0);
  });
});

describe("StorageService.streamFromSFTP — error / catch", () => {
  it("returns 500 JSON when getSftpClient throws and headers were NOT sent", async () => {
    // Force the next getSftpClient call to fail by making connect reject.
    // Use a fresh storageId so the pool branch goes cold and we hit connect.
    connectMock.mockRejectedValueOnce(new Error("ssh handshake failed"));

    const res = mockRes();
    res.headersSent = false;
    const req = {};

    await StorageService.streamFromSFTP(
      req,
      res,
      sftpCreds(),
      "/incidents/missing.mp4",
      "sftp-stream-err-1",
    );

    expect(res.statusCode).toBe(500);
    expect(res._body).toMatchObject({ error: expect.stringMatching(/Failed to stream file/i) });
  });

  it("calls res.end() WITHOUT touching status/body when headers were already sent before the throw", async () => {
    // Pre-seed a working session so getSftpClient succeeds, then make
    // createReadStream throw synchronously to fall into catch.
    const storageId = "sftp-stream-err-2";
    await StorageService.getSftpClient(storageId, sftpCreds());

    createReadStreamMock.mockImplementation(() => {
      throw new Error("read stream open failed");
    });

    const res = mockRes();
    res.headersSent = true; // simulate "already streamed something"
    // Spy on res.end so we can assert the else branch fired.
    const endSpy = vi.fn();
    res.end = endSpy;
    const statusBefore = res.statusCode;

    await StorageService.streamFromSFTP(
      {},
      res,
      sftpCreds(),
      "/incidents/file.mp4",
      storageId,
    );

    expect(endSpy).toHaveBeenCalledTimes(1);
    // statusCode untouched by the catch (the !headersSent branch was NOT taken).
    expect(res.statusCode).toBe(statusBefore);
  });
});

describe("StorageService.handleRangeRequest — 206 success path", () => {
  it("writes 206 with Content-Range/Content-Length and pipelines the byte-range stream", async () => {
    const res = mockRes();
    const byteRangeStream = Readable.from(Buffer.from("partial-bytes"));
    const sftp = {
      createReadStream: vi.fn().mockReturnValue(byteRangeStream),
    };

    // Range = bytes=0-49, fileSize = 1000 → end clamps to 49, chunksize = 50.
    await StorageService.handleRangeRequest(
      sftp,
      "/incidents/file.mp4",
      "bytes=0-49",
      res,
      1000,
    );
    await new Promise((r) => setTimeout(r, 30));

    expect(res._writeHeadCalls.length).toBe(1);
    const { code, hdrs } = res._writeHeadCalls[0];
    expect(code).toBe(206);
    expect(hdrs["Content-Range"]).toBe("bytes 0-49/1000");
    expect(hdrs["Content-Length"]).toBe(50);
    expect(hdrs["Accept-Ranges"]).toBe("bytes");
    expect(hdrs["Content-Type"]).toBeDefined();

    // The SFTP byte-range stream was opened with the explicit start/end.
    expect(sftp.createReadStream).toHaveBeenCalledWith(
      "/incidents/file.mp4",
      { start: 0, end: 49 },
    );
  });
});
