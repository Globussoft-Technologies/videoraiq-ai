import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mediaExists: vi.fn(),
  putMedia: vi.fn(),
  streamMedia: vi.fn(),
  mediaFindOneAndUpdate: vi.fn(),
  mediaFindOne: vi.fn(),
  mediaUpdateOne: vi.fn(),
  incidentFindById: vi.fn(),
  incidentFindOne: vi.fn(),
  incidentUpdateMany: vi.fn(),
  captureUpdateMany: vi.fn(),
  deleteMedia: vi.fn(),
  minioEnabled: vi.fn(),
  putFallback: vi.fn(),
  getFallback: vi.fn(),
  fallbackExists: vi.fn(),
  deleteFallback: vi.fn(),
  streamFallback: vi.fn(),
}));

vi.mock("../../core/v2/adminStorage/mediaStorage.v2.js", () => ({
  deleteMediaV2: mocks.deleteMedia,
  mediaExistsV2: mocks.mediaExists,
  putMediaV2: mocks.putMedia,
  streamMediaV2: mocks.streamMedia,
}));

vi.mock("../../core/v2/measurements/measurementCapture.model.js", () => ({
  default: {
    updateMany: mocks.captureUpdateMany,
  },
}));

vi.mock("../../core/v2/measurementMedia/measurementMedia.model.js", () => ({
  default: {
    findOneAndUpdate: mocks.mediaFindOneAndUpdate,
    findOne: mocks.mediaFindOne,
    updateOne: mocks.mediaUpdateOne,
  },
}));

vi.mock("../../core/v2/measurementIncidents/measurementIncidents.model.js", () => ({
  default: {
    findById: mocks.incidentFindById,
    findOne: mocks.incidentFindOne,
    updateMany: mocks.incidentUpdateMany,
  },
}));

vi.mock("../../core/v2/measurementMedia/measurementMinio.js", () => ({
  measurementMinioEnabled: mocks.minioEnabled,
  putMeasurementFallback: mocks.putFallback,
  getMeasurementFallback: mocks.getFallback,
  measurementFallbackExists: mocks.fallbackExists,
  deleteMeasurementFallback: mocks.deleteFallback,
  streamMeasurementFallback: mocks.streamFallback,
}));

vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { default: service, resolveMeasurementMediaReference, runMeasurementMediaRetryOnce } = await import(
  "../../core/v2/measurementMedia/measurementMedia.service.js"
);

function result(value) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function responseDouble() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function uploadRequest() {
  return {
    query: { mediaType: "image", folderName: "measurement-results" },
    file: {
      originalname: "result.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.from("measurement-image"),
    },
    verified: { userData: { system: true, service: "python-backend" } },
    get: vi.fn(() => ""),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.minioEnabled.mockReturnValue(true);
  mocks.mediaExists.mockResolvedValue(true);
  mocks.incidentUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mocks.captureUpdateMany.mockResolvedValue({ modifiedCount: 0 });
});

describe("measurement media upload", () => {
  it("keeps the shared upload response shape when cloud storage succeeds", async () => {
    let inserted;
    mocks.mediaFindOneAndUpdate
      .mockImplementationOnce((_filter, update) => {
        inserted = { _id: "asset-db-id", ...update.$setOnInsert };
        return result(inserted);
      })
      .mockImplementationOnce((_filter, update) => result({ ...inserted, ...update.$set }));
    mocks.putMedia.mockResolvedValue("/aws/uploads/images/measurement-results/result.jpg");

    const res = responseDouble();
    await service.upload(uploadRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      status: "success",
      message: "image uploaded successfully.",
      data: expect.objectContaining({
        originalName: "result.jpg",
        remotePath: "/aws/uploads/images/measurement-results/result.jpg",
        syncStatus: "completed",
      }),
    }));
    expect(mocks.putMedia).toHaveBeenCalledWith(expect.objectContaining({
      mediaType: "image",
      folderName: "measurement-results",
      objectId: expect.stringMatching(/^[a-f\d]{32}$/),
    }));
    expect(mocks.putFallback).not.toHaveBeenCalled();
  });

  it("returns a renderable backend path after saving a failed cloud upload to MinIO", async () => {
    let inserted;
    mocks.mediaFindOneAndUpdate
      .mockImplementationOnce((_filter, update) => {
        inserted = { _id: "asset-db-id", ...update.$setOnInsert };
        return result(inserted);
      })
      .mockImplementationOnce((_filter, update) => result({ ...inserted, ...update.$set }));
    mocks.putMedia.mockRejectedValue(new Error("S3 unavailable"));

    const res = responseDouble();
    await service.upload(uploadRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.data.remotePath).toMatch(/^\/api\/v2\/measurement-media\/[a-f\d]{32}$/);
    expect(res.payload.data.syncStatus).toBe("pending");
    expect(mocks.putFallback).toHaveBeenCalledWith(expect.objectContaining({
      contentType: "image/jpeg",
      buffer: Buffer.from("measurement-image"),
    }));
  });

  it("returns the same pending asset when the same upload is retried", async () => {
    let inserted;
    let pending;
    mocks.mediaFindOneAndUpdate
      .mockImplementationOnce((_filter, update) => {
        inserted = { _id: "asset-db-id", ...update.$setOnInsert };
        return result(inserted);
      })
      .mockImplementationOnce((_filter, update) => {
        pending = { ...inserted, ...update.$set };
        return result(pending);
      })
      .mockImplementationOnce(() => result(pending));
    mocks.putMedia.mockRejectedValue(new Error("S3 unavailable"));

    const first = responseDouble();
    const second = responseDouble();
    await service.upload(uploadRequest(), first);
    await service.upload(uploadRequest(), second);

    expect(second.statusCode).toBe(200);
    expect(second.payload.data.assetId).toBe(first.payload.data.assetId);
    expect(second.payload.data.remotePath).toBe(first.payload.data.remotePath);
    expect(mocks.putMedia).toHaveBeenCalledTimes(1);
    expect(mocks.putFallback).toHaveBeenCalledTimes(1);
  });

  it("resolves a late fallback reference to its completed cloud path", async () => {
    mocks.mediaFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue(result({
        stablePath: "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cloudPath: "/aws/uploads/images/measurement-results/result.jpg",
      })),
    });

    await expect(resolveMeasurementMediaReference(
      "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )).resolves.toBe("/aws/uploads/images/measurement-results/result.jpg");
  });

  it("replaces the incident URL before deleting the synchronized MinIO object", async () => {
    const pending = {
      _id: "asset-db-id",
      assetId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      adminId: null,
      incidentId: "650000000000000000000501",
      originalName: "result.jpg",
      folderName: "measurement-results",
      stablePath: "/api/v2/measurement-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      localKey: "measurement-fallback/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/result.jpg",
      cloudPath: null,
      attempts: 1,
      source: "measurement-result",
    };
    const cloudSynced = {
      ...pending,
      cloudPath: "/aws/uploads/images/measurement-results/result.jpg",
      status: "cloud_synced",
    };
    mocks.mediaFindOneAndUpdate
      .mockReturnValueOnce(result(pending))
      .mockReturnValueOnce(result(cloudSynced))
      .mockReturnValueOnce(result(null));
    mocks.fallbackExists.mockResolvedValue(true);
    mocks.getFallback.mockResolvedValue(Buffer.from("measurement-image"));
    mocks.putMedia.mockResolvedValue(cloudSynced.cloudPath);
    mocks.incidentUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.deleteFallback.mockResolvedValue(undefined);
    mocks.mediaUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    await runMeasurementMediaRetryOnce();

    expect(mocks.incidentUpdateMany).toHaveBeenCalledWith(
      { _id: pending.incidentId, measurementImage: pending.stablePath },
      { $set: { measurementImage: cloudSynced.cloudPath } },
    );
    expect(mocks.deleteFallback).toHaveBeenCalledWith(pending.localKey);
    expect(mocks.incidentUpdateMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteFallback.mock.invocationCallOrder[0]);
    expect(mocks.captureUpdateMany).not.toHaveBeenCalled();
  });

  it("replaces the QR capture path before deleting the synchronized MinIO object", async () => {
    const pending = {
      _id: "asset-db-id",
      assetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      adminId: null,
      incidentId: null,
      originalName: "capture.jpg",
      sourceReference: "capture.jpg",
      source: "qr-capture",
      folderName: "measurement-captures",
      stablePath: "/api/v2/measurement-media/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      localKey: "measurement-fallback/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/capture.jpg",
      cloudPath: null,
      attempts: 1,
    };
    const cloudSynced = {
      ...pending,
      cloudPath: "/aws/uploads/images/measurement-captures/capture.jpg",
      status: "cloud_synced",
    };
    mocks.mediaFindOneAndUpdate
      .mockReturnValueOnce(result(pending))
      .mockReturnValueOnce(result(cloudSynced))
      .mockReturnValueOnce(result(null));
    mocks.fallbackExists.mockResolvedValue(true);
    mocks.getFallback.mockResolvedValue(Buffer.from("qr-capture"));
    mocks.putMedia.mockResolvedValue(cloudSynced.cloudPath);
    mocks.captureUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.deleteFallback.mockResolvedValue(undefined);
    mocks.mediaUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    await runMeasurementMediaRetryOnce();

    expect(mocks.captureUpdateMany).toHaveBeenCalledWith(
      { filename: pending.sourceReference, storagePath: pending.stablePath },
      { $set: { storagePath: cloudSynced.cloudPath } },
    );
    expect(mocks.incidentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.captureUpdateMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteFallback.mock.invocationCallOrder[0]);
  });
});
