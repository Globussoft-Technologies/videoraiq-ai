import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "stream";

const mocks = vi.hoisted(() => ({
  adminId: "507f1f77bcf86cd799439011",
  provider: "aws",
  send: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  mkdir: vi.fn(),
  put: vi.fn(),
  exists: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock("../../../middlewares/verifyToken.js", () => ({
  default: (req, res, next) => {
    if (!req.header("x-access-token")) return res.status(401).json({ message: "Login required" });
    req.verified = { userData: { adminId: req.header("x-access-token") === "user" ? mocks.adminId : undefined } };
    next();
  },
}));
vi.mock("../../../utils/database.js", () => ({ redis: {} }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...await importOriginal(),
  S3Client: class { send(command) { return mocks.send(command); } },
}));
vi.mock("ssh2-sftp-client", () => ({
  default: class {
    connect = mocks.connect;
    end = mocks.end;
    mkdir = mocks.mkdir;
    put = mocks.put;
    exists = mocks.exists;
    createReadStream = mocks.createReadStream;
  },
}));
vi.mock("../../../core/v2/adminStorage/adminStorage.resolver.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveStorageConfig: vi.fn(async ({ storagePath } = {}) => ({
      adminId: mocks.adminId,
      provider: mocks.provider,
      source: "env",
      versionId: "env",
      parsed: actual.parseV2StoragePath(storagePath),
      config: {
        region: "test", bucket: "test-bucket", accessKeyId: "test-key", secretAccessKey: "test-secret",
        host: "test-host", username: "test-user", password: "test-pass", basePath: "/media",
      },
    })),
  };
});

const { default: v2Routes } = await import("../../../core/v2/Uploads/uploads.routes.js");
const { default: v1Routes } = await import("../../../core/v1/Uploads/uploads.routes.js");
const { default: storageRoutes } = await import("../../../core/v1/storage/storage.routes.js");
const { MAX_FILE_UPLOAD_BYTES } = await import("../../../core/v2/Uploads/uploads.service.js");
const app = express();
app.use("/api/v2/uploads", v2Routes);
app.use("/api/v1/uploads", v1Routes);
app.use("/api/v1/storage", storageRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.provider = "aws";
  mocks.send.mockImplementation(async () => ({
    Body: Readable.from(["<script>untrusted</script>"]), ContentType: "text/html",
  }));
  mocks.connect.mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.put.mockResolvedValue(undefined);
  mocks.exists.mockResolvedValue(true);
  mocks.createReadStream.mockImplementation(() => Readable.from(["<script>untrusted</script>"]));
});

describe("general file uploads", () => {
  it("requires authentication before accepting a file", async () => {
    const response = await request(app).post("/api/v2/uploads/media?mediaType=file&folderName=docs")
      .attach("file", Buffer.from("contents"), "document.pdf");
    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["document.pdf", "archive.zip", "readme", "page.html", "program.exe", "drawing.svg", "photo.jpg"])(
    "accepts %s as an attachment with a generated storage key", async (name) => {
      const response = await request(app).post("/api/v2/uploads/media?mediaType=file&folderName=docs")
        .set("x-access-token", "user").attach("file", Buffer.from("contents"), name);
      expect(response.status).toBe(200);
      expect(response.body.data.originalName).toBe(name);
      expect(response.body.data.remotePath).toMatch(new RegExp(`^/v2/${mocks.adminId}/env/aws/uploads/files/docs/\\d+-[a-f0-9-]+-`));
      expect(mocks.send.mock.calls[0][0].input).toMatchObject({
        Key: response.body.data.remotePath.slice(1), Body: Buffer.from("contents"),
        ContentType: "application/octet-stream", ContentDisposition: "attachment",
      });
    },
  );

  it("rejects a file over 25 MB before writing it to storage", async () => {
    const response = await request(app).post("/api/v2/uploads/media?mediaType=file&folderName=docs")
      .set("x-access-token", "user").attach("file", Buffer.alloc(MAX_FILE_UPLOAD_BYTES + 1), "large.zip");
    expect(response.status).toBe(413);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects multiple files", async () => {
    const response = await request(app).post("/api/v2/uploads/media?mediaType=file&folderName=docs")
      .set("x-access-token", "user").attach("file", Buffer.from("a"), "a.txt").attach("file", Buffer.from("b"), "b.txt");
    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires an organisation rather than falling back to shared legacy storage", async () => {
    const response = await request(app).post("/api/v2/uploads/media?mediaType=file&folderName=docs")
      .set("x-access-token", "service").attach("file", Buffer.from("contents"), "document.pdf");
    expect(response.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps folder input inside the generated storage namespace", async () => {
    const response = await request(app).post("/api/v2/uploads/media")
      .query({ mediaType: "file", folderName: "../../other" })
      .set("x-access-token", "user").attach("file", Buffer.from("contents"), "document.pdf");
    expect(response.status).toBe(200);
    expect(response.body.data.remotePath).not.toContain("..");
    expect(response.body.data.remotePath.split("/")).toHaveLength(9);
  });

  it("keeps existing image validation", async () => {
    const response = await request(app).post("/api/v2/uploads/media?mediaType=image&folderName=docs")
      .set("x-access-token", "user").attach("file", Buffer.from("contents"), "page.html");
    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe.each(["v1", "v2"])("public %s file downloads", (version) => {
  it.each(["aws", "gcp", "oracle", "nas"])("forces attachment headers for %s even with HTML metadata", async (provider) => {
    mocks.provider = provider;
    const key = `v2/${mocks.adminId}/env/${provider}/uploads/files/docs/id-page.html`;
    const response = await request(app).get(`/api/${version}/uploads/${key}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-disposition"]).toMatch(/^attachment/);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body.toString()).toBe("<script>untrusted</script>");
  });

  it("preserves a requested download filename", async () => {
    const key = `v2/${mocks.adminId}/env/aws/uploads/files/docs/id-page.html`;
    const response = await request(app).get(`/api/${version}/uploads/${key}`).query({ download: "original.html" });
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain('filename="original.html"');
  });

  it("keeps attachment headers for equivalent NAS paths", async () => {
    mocks.provider = "nas";
    const key = `v2/${mocks.adminId}/env/nas/uploads//FILES/docs/id-page.pdf`;
    const response = await request(app).get(`/api/${version}/uploads/${key}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-disposition"]).toMatch(/^attachment/);
  });
});

it("keeps general files as attachments through the legacy storage endpoint", async () => {
  mocks.provider = "nas";
  const key = `/media/v2/${mocks.adminId}/env/nas/uploads/files/docs/id-page.pdf`;
  const response = await request(app).get(`/api/v1/storage/get/${encodeURIComponent(key)}`);
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toBe("application/octet-stream");
  expect(response.headers["content-disposition"]).toMatch(/^attachment/);
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
});
