/**
 * Integration coverage for StorageService.streamFromS3 — the S3 streaming
 * branches (HeadObjectCommand → GetObjectCommand, with and without a Range
 * header, plus the error/catch branch). These bodies (~80 lines) were
 * previously uncovered because the existing storage.service.s3.test.js only
 * exercises addStorage/uploadFile.
 *
 * Mocks (3, well under the 8-mock ceiling):
 *   1. @aws-sdk/client-s3         — S3Client + HeadObjectCommand + GetObjectCommand
 *   2. mime-types                 — same shim the other storage tests use
 *   3. utils/newSFTPConnectionCheck.js — quiet the module-load interval
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
const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
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

vi.mock("mime-types", () => ({
  default: {
    extension: vi.fn(() => "mp4"),
    lookup: vi.fn(() => "video/mp4"),
  },
  extension: vi.fn(() => "mp4"),
  lookup: vi.fn(() => "video/mp4"),
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

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  sendMock.mockReset();
});

/** Build a mock res object backed by a PassThrough stream so .pipe works. */
function mockRes() {
  const headers = {};
  const stream = new PassThrough();
  stream.on("data", () => {}); // drain so source can flush
  // Attach the bookkeeping fields/methods directly onto the stream itself
  // so it remains a real writable that Node's pipe/finish can hook into
  // (removeListener, on, emit, etc. all work as expected).
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
  stream.json = function (body) {
    this._body = body;
    return this;
  };
  return { res: stream, dest: stream };
}

function s3Creds() {
  return {
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "secret-decoded",
    bucketName: "test-bucket",
    region: "us-east-1",
  };
}

describe("StorageService.streamFromS3 — full file", () => {
  it("writeHead 200 with Content-Length when no Range header is present", async () => {
    // First call: HeadObjectCommand → returns size + content-type.
    sendMock.mockImplementationOnce(async () => ({
      ContentLength: 1024,
      ContentType: "video/mp4",
    }));
    // Second call: GetObjectCommand → returns a stream Body.
    const bodyStream = Readable.from(Buffer.from("hello"));
    sendMock.mockImplementationOnce(async () => ({ Body: bodyStream }));

    const { res } = mockRes();
    const req = { headers: {} };

    await StorageService.streamFromS3(req, res, s3Creds(), "creatives/abc.mp4");
    // Wait for stream pipe lifecycle to flush.
    await new Promise((r) => setTimeout(r, 30));

    expect(res.statusCode).toBe(200);
    expect(res._headers["Content-Length"]).toBe(1024);
    expect(res._headers["Content-Type"]).toBe("video/mp4");
    expect(res._headers["Accept-Ranges"]).toBe("bytes");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe("StorageService.streamFromS3 — partial range", () => {
  it("writeHead 206 with Content-Range for a byte-range request", async () => {
    sendMock.mockImplementationOnce(async () => ({
      ContentLength: 1000,
      ContentType: "video/mp4",
    }));
    const bodyStream = Readable.from(Buffer.from("partial"));
    sendMock.mockImplementationOnce(async () => ({ Body: bodyStream }));

    const { res } = mockRes();
    const req = { headers: { range: "bytes=0-99" } };

    await StorageService.streamFromS3(req, res, s3Creds(), "creatives/abc.mp4");
    await new Promise((r) => setTimeout(r, 30));

    expect(res.statusCode).toBe(206);
    expect(res._headers["Content-Range"]).toBe("bytes 0-99/1000");
    expect(res._headers["Content-Length"]).toBe(100);
  });

  it("uses (fileSize - 1) as end when the range omits the upper bound", async () => {
    sendMock.mockImplementationOnce(async () => ({
      ContentLength: 500,
      ContentType: "video/mp4",
    }));
    const bodyStream = Readable.from(Buffer.from("rest"));
    sendMock.mockImplementationOnce(async () => ({ Body: bodyStream }));

    const { res } = mockRes();
    const req = { headers: { range: "bytes=200-" } };

    await StorageService.streamFromS3(req, res, s3Creds(), "k");
    await new Promise((r) => setTimeout(r, 30));

    expect(res.statusCode).toBe(206);
    expect(res._headers["Content-Range"]).toBe("bytes 200-499/500");
    expect(res._headers["Content-Length"]).toBe(300);
  });
});

describe("StorageService.streamFromS3 — error/catch", () => {
  it("returns 500 when HeadObjectCommand throws and headers were not sent", async () => {
    sendMock.mockRejectedValueOnce(new Error("NoSuchKey"));
    const { res } = mockRes();
    res.headersSent = false; // explicit reset
    const req = { headers: {} };
    await StorageService.streamFromS3(req, res, s3Creds(), "missing");
    expect(res.statusCode).toBe(500);
    expect(res._body?.error).toMatch(/Failed to stream/i);
  });
});
