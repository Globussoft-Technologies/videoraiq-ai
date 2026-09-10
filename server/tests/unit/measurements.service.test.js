import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteOne: vi.fn(),
  findOne: vi.fn(),
  deleteMedia: vi.fn(),
  putMedia: vi.fn(),
  streamMedia: vi.fn(),
}));

vi.mock("../../core/v2/measurements/measurementCapture.model.js", () => ({
  default: { create: mocks.create, deleteOne: mocks.deleteOne, findOne: mocks.findOne },
}));
vi.mock("../../utils/mediaStorage.js", () => ({
  deleteMedia: mocks.deleteMedia,
  putMedia: mocks.putMedia,
  streamMedia: mocks.streamMedia,
}));
vi.mock("../../utils/logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { default: service, isJpeg } = await import(
  "../../core/v2/measurements/measurements.service.js"
);

function jpeg() {
  return Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
}

function request(overrides = {}) {
  const headers = {
    "x-camera-id": "top-camera",
    "x-station-id": "aa:bb:cc:dd:ee:ff",
    "x-capture-trigger": "start",
    "x-captured-at": "2026-09-08T10:30:00.000Z",
    "content-type": "image/jpeg",
    host: "backend:5055",
    ...overrides.headers,
  };
  return {
    body: jpeg(),
    baseUrl: "/api/v2/measurements",
    protocol: "http",
    stationToken: { stationId: "aa:bb:cc:dd:ee:ff" },
    get(name) { return headers[name.toLowerCase()]; },
    ...overrides,
  };
}

function responseDouble() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.putMedia.mockResolvedValue("/uploads/images/measurement-captures/capture.jpg");
  mocks.create.mockResolvedValue({});
  mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
  mocks.deleteMedia.mockResolvedValue(undefined);
});

describe("measurement capture upload", () => {
  it("recognizes JPEG start/end framing", () => {
    expect(isJpeg(jpeg())).toBe(true);
    expect(isJpeg(Buffer.from("not-jpeg"))).toBe(false);
  });

  it("stores a valid raw JPEG and preserves the response contract", async () => {
    const req = request();
    const res = responseDouble();

    await service.createCapture(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({
      ok: true,
      filename: expect.stringMatching(/\.jpg$/),
      bytes: req.body.length,
      path: expect.stringMatching(/^\/api\/v2\/measurements\/captures\//),
      url: expect.stringMatching(/^http:\/\/backend:5055\/api\/v2\/measurements\/captures\//),
      captured_at: "2026-09-08T10:30:00.000Z",
    });
    expect(mocks.putMedia).toHaveBeenCalledWith(expect.objectContaining({
      buffer: req.body,
      mediaType: "image",
      folderName: "measurement-captures",
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "aa:bb:cc:dd:ee:ff",
      cameraId: "top-camera",
      bytes: req.body.length,
    }));
  });

  it("rejects a station header that does not match the token", async () => {
    const res = responseDouble();
    await service.createCapture(request({
      headers: { "x-station-id": "11:22:33:44:55:66" },
    }), res);
    expect(res.statusCode).toBe(403);
    expect(mocks.putMedia).not.toHaveBeenCalled();
  });

  it("rejects invalid JPEG bytes", async () => {
    const res = responseDouble();
    await service.createCapture(request({ body: Buffer.from("not-jpeg") }), res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.message).toBe("Invalid JPEG framing");
  });

  it("deletes only a capture owned by the approved station", async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "650000000000000000000700",
        filename: "capture.jpg",
        storagePath: "/uploads/images/measurement-captures/capture.jpg",
      }),
    });
    const res = responseDouble();

    await service.deleteCapture(request({ params: { filename: "capture.jpg" } }), res);

    expect(mocks.findOne).toHaveBeenCalledWith({
      filename: "capture.jpg",
      stationId: "aa:bb:cc:dd:ee:ff",
    });
    expect(mocks.deleteMedia).toHaveBeenCalledWith("/uploads/images/measurement-captures/capture.jpg");
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: "650000000000000000000700" });
    expect(res.statusCode).toBe(200);
  });

  it("allows the frontend origin to embed a stored capture", async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        filename: "capture.jpg",
        storagePath: "/uploads/images/measurement-captures/capture.jpg",
      }),
    });
    const res = responseDouble();

    await service.fetchCapture(request({ params: { filename: "capture.jpg" } }), res);

    expect(res.headers["Content-Type"]).toBe("image/jpeg");
    expect(res.headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
    expect(mocks.streamMedia).toHaveBeenCalledWith(
      "/uploads/images/measurement-captures/capture.jpg",
      res,
    );
  });
});
