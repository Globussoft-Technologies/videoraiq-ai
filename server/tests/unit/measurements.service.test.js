import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
  findOne: vi.fn(),
  deleteMedia: vi.fn(),
  streamMedia: vi.fn(),
  storeMeasurementMediaBuffer: vi.fn(),
  streamMeasurementMediaReference: vi.fn(),
  deleteMeasurementMediaReference: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  axiosPost: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock("../../core/v2/measurements/measurementCapture.model.js", () => ({
  default: {
    findOneAndUpdate: mocks.findOneAndUpdate,
    deleteOne: mocks.deleteOne,
    findOne: mocks.findOne,
  },
}));
vi.mock("../../utils/mediaStorage.js", () => ({
  deleteMedia: mocks.deleteMedia,
  streamMedia: mocks.streamMedia,
}));
vi.mock("../../core/v2/measurementMedia/measurementMedia.service.js", () => ({
  storeMeasurementMediaBuffer: mocks.storeMeasurementMediaBuffer,
  streamMeasurementMediaReference: mocks.streamMeasurementMediaReference,
  deleteMeasurementMediaReference: mocks.deleteMeasurementMediaReference,
}));
vi.mock("../../utils/logger.js", () => ({
  default: { error: vi.fn(), info: mocks.loggerInfo, warn: mocks.loggerWarn },
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
    stationDevice: { ip: "192.168.0.177", admin: "650000000000000000000001" },
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
  mocks.storeMeasurementMediaBuffer.mockResolvedValue({
    cloudPath: "/uploads/images/measurement-captures/capture.jpg",
    stablePath: "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  mocks.findOneAndUpdate.mockResolvedValue({});
  mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
  mocks.deleteMedia.mockResolvedValue(undefined);
  mocks.streamMeasurementMediaReference.mockResolvedValue(false);
  mocks.deleteMeasurementMediaReference.mockResolvedValue(false);
});

describe("measurement capture upload", () => {
  it("proxies measurement start through the approved station IP", async () => {
    mocks.axiosPost.mockResolvedValue({
      status: 202,
      data: { request_id: "measurement-123", status: "processing", estimated_measurement_seconds: 15 },
    });
    const res = responseDouble();

    await service.startMeasurement(request({
      body: { sku: "g_ok8478", length: 78, width: 72, height: 6 },
    }), res);

    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "http://192.168.0.177:8000/v1/dimensions/measure",
      { sku: "G_OK8478", length: 78, width: 72, height: 6 },
      expect.objectContaining({ timeout: 25000, maxRedirects: 0 }),
    );
    expect(res.statusCode).toBe(202);
    expect(res.payload.request_id).toBe("measurement-123");
  });

  it("rejects incomplete measurement payloads before contacting DS", async () => {
    const res = responseDouble();

    await service.startMeasurement(request({
      body: { sku: "G_OK8478", length: 78, width: 72 },
    }), res);

    expect(res.statusCode).toBe(422);
    expect(res.payload.message).toContain("height");
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("proxies QR images through the approved station IP", async () => {
    mocks.axiosPost.mockResolvedValue({
      status: 200,
      data: { found: true, dimensions: { sku: "G_OK8478" } },
    });
    const res = responseDouble();

    await service.extractQr(request({
      file: {
        buffer: jpeg(),
        mimetype: "image/jpeg",
        originalname: "qr_code.jpg",
      },
    }), res);

    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "http://192.168.0.177:8000/v1/qr/extract-dimensions",
      expect.any(FormData),
      expect.objectContaining({ timeout: 25000, maxRedirects: 0 }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload.found).toBe(true);
  });

  it("returns a gateway error when the approved station DS cannot be reached", async () => {
    mocks.axiosPost.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const res = responseDouble();

    await service.startMeasurement(request({
      body: { sku: "G_OK8478", length: 78, width: 72, height: 6 },
    }), res);

    expect(res.statusCode).toBe(502);
    expect(res.payload.message).toBe("Unable to reach the station measurement service");
  });

  it("does not proxy to a non-IP value stored on a station", async () => {
    const res = responseDouble();

    await service.startMeasurement(request({
      body: { sku: "G_OK8478", length: 78, width: 72, height: 6 },
      stationDevice: { ip: "example.com" },
    }), res);

    expect(res.statusCode).toBe(422);
    expect(res.payload.message).toContain("invalid IP address");
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("preserves actionable DS validation errors", async () => {
    mocks.axiosPost.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: [{ msg: "Field required", loc: ["body", "height"] }] },
      },
    });
    const res = responseDouble();

    await service.startMeasurement(request({
      body: { sku: "G_OK8478", length: 78, width: 72, height: 6 },
    }), res);

    expect(res.statusCode).toBe(422);
    expect(res.payload.message).toBe("Field required");
  });

  it("records DS request and connectivity diagnostics in backend logs", async () => {
    const res = responseDouble();
    await service.createDiagnostic(request({
      body: {
        event: "unreachable",
        endpoint: "http://192.168.0.177:8000/v1/dimensions/measure",
        sku: "AGK7872",
        dimensions: { length: 78, width: 72, height: 6 },
        durationMs: 2031,
        message: "Failed to fetch",
      },
    }), res);

    expect(res.statusCode).toBe(202);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining(
      "[MEASUREMENT_DS] event=unreachable station=aa:bb:cc:dd:ee:ff",
    ));
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining(
      "endpoint=http://192.168.0.177:8000/v1/dimensions/measure",
    ));
  });

  it("rejects unknown DS diagnostic event names", async () => {
    const res = responseDouble();
    await service.createDiagnostic(request({ body: { event: "anything" } }), res);
    expect(res.statusCode).toBe(400);
    expect(mocks.loggerInfo).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

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
    expect(mocks.storeMeasurementMediaBuffer).toHaveBeenCalledWith(expect.objectContaining({
      buffer: req.body,
      folderName: "measurement-captures",
      contentType: "image/jpeg",
      source: "qr-capture",
      sourceReference: expect.stringMatching(/\.jpg$/),
    }));
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { filename: res.payload.filename },
      { $setOnInsert: expect.objectContaining({
        stationId: "aa:bb:cc:dd:ee:ff",
        cameraId: "top-camera",
        bytes: req.body.length,
      }) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  });

  it("rejects a station header that does not match the token", async () => {
    const res = responseDouble();
    await service.createCapture(request({
      headers: { "x-station-id": "11:22:33:44:55:66" },
    }), res);
    expect(res.statusCode).toBe(403);
    expect(mocks.storeMeasurementMediaBuffer).not.toHaveBeenCalled();
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

  it("keeps the QR capture flow running when the image is pending in local MinIO", async () => {
    const stablePath = "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    mocks.storeMeasurementMediaBuffer.mockResolvedValue({ cloudPath: null, stablePath });
    const res = responseDouble();

    await service.createCapture(request(), res);

    expect(res.statusCode).toBe(201);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { filename: res.payload.filename },
      { $setOnInsert: expect.objectContaining({ storagePath: stablePath }) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  });

  it("streams a pending QR capture through the resilient media layer", async () => {
    const stablePath = "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ filename: "capture.jpg", storagePath: stablePath }),
    });
    mocks.streamMeasurementMediaReference.mockResolvedValue(true);
    const res = responseDouble();

    await service.fetchCapture(request({ params: { filename: "capture.jpg" } }), res);

    expect(mocks.streamMeasurementMediaReference).toHaveBeenCalledWith(stablePath, res);
    expect(mocks.streamMedia).not.toHaveBeenCalled();
  });

  it("deletes a pending QR capture through the resilient media layer", async () => {
    const stablePath = "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "650000000000000000000700",
        filename: "capture.jpg",
        storagePath: stablePath,
      }),
    });
    mocks.deleteMeasurementMediaReference.mockResolvedValue(true);
    const res = responseDouble();

    await service.deleteCapture(request({ params: { filename: "capture.jpg" } }), res);

    expect(mocks.deleteMeasurementMediaReference).toHaveBeenCalledWith({
      reference: stablePath,
      sourceReference: "capture.jpg",
    });
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: "650000000000000000000700" });
    expect(res.statusCode).toBe(200);
  });
});
