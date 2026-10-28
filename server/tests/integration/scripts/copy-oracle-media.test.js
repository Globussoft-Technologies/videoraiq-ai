import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const { send, construct } = vi.hoisted(() => ({ send: vi.fn(), construct: vi.fn() }));
vi.mock("dotenv/config", () => ({}));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const sdk = await importOriginal();
  return {
    ...sdk,
    S3Client: class {
      constructor(options) { construct(options); }
      send(command) { return send(command); }
    },
  };
});
import { main } from "../../../scripts/copy-oracle-media.js";

const key = "v2/admin/test/oracle/uploads/images/day/image.jpg";
const originalExitCode = process.exitCode;
const head = {
  ContentLength: 5, ETag: '"source-etag"', ContentType: "image/jpeg",
  CacheControl: "private", ContentDisposition: "inline", ContentEncoding: "identity",
  ContentLanguage: "en", Expires: new Date("2027-01-01"), Metadata: { camera: "test" },
};
const missing = () => Object.assign(new Error("Not found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
const calls = (name) => send.mock.calls.map(([command]) => command).filter((command) => command.constructor.name === name);
const summary = () => JSON.parse(console.log.mock.calls.at(-1)[0]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = 0;
  for (const name of ["SOURCE", "TARGET"]) {
    for (const [variable, value] of Object.entries({
      REGION: "test-region", ENDPOINT: `https://${name.toLowerCase()}.example.test`,
      BUCKET: name.toLowerCase(), ACCESS_KEY_ID: "test-access", SECRET_ACCESS_KEY: "test-secret",
    })) vi.stubEnv(`${name}_OCI_${variable}`, value);
  }
  send.mockImplementation(async (command) => {
    if (command.constructor.name === "HeadObjectCommand") {
      if (command.input.Bucket === "source") return head;
      throw missing();
    }
    throw new Error(`Unexpected storage call: ${command.constructor.name}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = originalExitCode;
});

describe("Oracle media migration with mocked storage", () => {
  it.each([
    [], ["--key", key], ["--key", key, "--dry-run", "--execute"],
    ["--key", key, "--prefix", "v2/", "--execute"],
    ["--prefix", "v2/", "--destination-key", key, "--execute"],
    ["--check-connection", "--execute"], ["--key", "--dry-run"],
    ["--key", key, "--execute", "--unknown"],
  ])("rejects ambiguous or invalid arguments before contacting storage: %j", async (...args) => {
    await main(args);
    expect(process.exitCode).toBe(1);
    expect(construct).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects invalid concurrency and missing credentials before contacting storage", async () => {
    await expect(main(["--prefix", "v2/", "--dry-run", "--concurrency", "9"])).rejects.toThrow("1 to 8");
    vi.stubEnv("SOURCE_OCI_SECRET_ACCESS_KEY", "");
    await expect(main(["--key", key, "--execute"])).rejects.toThrow("SOURCE_OCI_SECRET_ACCESS_KEY");
    expect(send).not.toHaveBeenCalled();
  });

  it("dry-runs a media URL without downloading or uploading its object", async () => {
    await main(["--key", `https://media.example.test/uploads/${key}`, "--dry-run"]);
    expect(calls("HeadObjectCommand").map((command) => command.input.Key)).toEqual([key, key]);
    expect(calls("GetObjectCommand")).toHaveLength(0);
    expect(calls("PutObjectCommand")).toHaveLength(0);
    expect(summary()).toEqual({ planned: 1, copied: 0, skipped: 0, failed: 0 });
  });

  it.each([true, false])("preserves existing destination objects (same content: %s)", async (same) => {
    send.mockImplementation(async (command) => {
      if (command.constructor.name !== "HeadObjectCommand") throw new Error("Unexpected write or download");
      return command.input.Bucket === "source" || same ? head : { ...head, ETag: '"different"' };
    });
    await main(["--key", key, "--execute"]);
    expect(calls("GetObjectCommand")).toHaveLength(0);
    expect(calls("PutObjectCommand")).toHaveLength(0);
    expect(summary()).toEqual({ planned: 0, copied: 0, skipped: same ? 1 : 0, failed: same ? 0 : 1 });
    expect(process.exitCode).toBe(same ? 0 : 1);
  });

  it.each(["success", "concurrent destination", "verification mismatch"])("copies with a conditional PUT and verifies the result: %s", async (outcome) => {
    const body = Readable.from([Buffer.from("image")]);
    let uploaded = false;
    send.mockImplementation(async (command) => {
      switch (command.constructor.name) {
        case "HeadObjectCommand":
          if (command.input.Bucket === "source") return head;
          if (!uploaded) throw missing();
          return outcome === "verification mismatch" ? { ...head, ETag: '"wrong"' } : head;
        case "GetObjectCommand": return { ...head, Body: body };
        case "PutObjectCommand":
          if (outcome === "concurrent destination") throw Object.assign(new Error("Destination created concurrently"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
          uploaded = true;
          return {};
        default: throw new Error("Unexpected storage call");
      }
    });
    const destinationKey = "archive/image.jpg";
    await main(["--key", key, "--destination-key", destinationKey, "--execute"]);
    expect(calls("GetObjectCommand")[0].input).toEqual({ Bucket: "source", Key: key });
    expect(calls("PutObjectCommand")).toHaveLength(1);
    expect(calls("PutObjectCommand")[0].input).toMatchObject({
      Bucket: "target", Key: destinationKey, Body: body, IfNoneMatch: "*",
      ContentLength: head.ContentLength, ContentType: head.ContentType,
      CacheControl: head.CacheControl, ContentDisposition: head.ContentDisposition,
      ContentEncoding: head.ContentEncoding, ContentLanguage: head.ContentLanguage,
      Expires: head.Expires, Metadata: head.Metadata,
    });
    expect(summary()).toEqual({ planned: 0, copied: outcome === "success" ? 1 : 0, skipped: 0, failed: outcome === "success" ? 0 : 1 });
    expect(process.exitCode).toBe(outcome === "success" ? 0 : 1);
    if (outcome === "concurrent destination") expect(body.destroyed).toBe(true);
    body.destroy();
  });

  it("paginates a prefix, remaps its suffixes, limits concurrency and continues after a conflict", async () => {
    let active = 0;
    let peak = 0;
    send.mockImplementation(async (command) => {
      if (command.constructor.name === "ListObjectsV2Command") {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: "v2/four.jpg" }] }
          : { Contents: [{ Key: "v2/one.jpg" }, { Key: "v2/nested/two.jpg" }, { Key: "v2/three.jpg" }], NextContinuationToken: "page-two" };
      }
      if (command.constructor.name !== "HeadObjectCommand") throw new Error("Dry run must not write or download");
      if (command.input.Bucket === "target") {
        if (command.input.Key === "archive/nested/two.jpg") return { ...head, ETag: '"conflict"' };
        throw missing();
      }
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return head;
    });
    await main(["--prefix", "v2", "--destination-prefix", "archive", "--dry-run", "--concurrency", "2", "--quiet"]);
    expect(calls("ListObjectsV2Command").map((command) => command.input)).toEqual([
      { Bucket: "source", Prefix: "v2/", ContinuationToken: undefined },
      { Bucket: "source", Prefix: "v2/", ContinuationToken: "page-two" },
    ]);
    expect(calls("HeadObjectCommand").filter((command) => command.input.Bucket === "target").map((command) => command.input.Key).sort()).toEqual([
      "archive/four.jpg", "archive/nested/two.jpg", "archive/one.jpg", "archive/three.jpg",
    ]);
    expect(peak).toBe(2);
    expect(summary()).toEqual({ planned: 3, copied: 0, skipped: 0, failed: 1 });
    expect(process.exitCode).toBe(1);
  });

  it("checks both connections without copying media", async () => {
    send.mockResolvedValue({});
    await main(["--check-connection"]);
    expect(send.mock.calls.map(([command]) => [command.constructor.name, command.input.Bucket])).toEqual([
      ["HeadBucketCommand", "source"], ["HeadBucketCommand", "target"],
    ]);
  });
});
