import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  processWithDs: vi.fn(),
  sendPayloadToUser: vi.fn(),
  sendMeasurement: vi.fn(),
}));

vi.mock("../../core/v2/measurementIncidents/measurementIncidents.model.js", () => ({
  default: {
    create: mocks.create,
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOneAndDelete: mocks.findOneAndDelete,
    findOne: mocks.findOne,
    find: mocks.find,
    countDocuments: mocks.countDocuments,
  },
}));

vi.mock("../../core/v2/measurementIncidents/measurementDs.client.js", () => ({
  MeasurementDsError: class MeasurementDsError extends Error {
    constructor(message, statusCode = 502) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  processWithDs: mocks.processWithDs,
}));

vi.mock("../../socket.js", () => ({
  sendPayloadToUser: mocks.sendPayloadToUser,
  sendMeasurement: mocks.sendMeasurement,
}));

vi.mock("../../utils/logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { default: service } = await import(
  "../../core/v2/measurementIncidents/measurementIncidents.service.js"
);

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

const identity = {
  verified: {
    userData: {
      adminId: "650000000000000000000001",
      user_id: 1234,
      memberId: "650000000000000000000002",
    },
  },
};

beforeEach(() => vi.clearAllMocks());

describe("measurement incident service", () => {
  it("creates a pending incident from QR metadata without calling DS", async () => {
    const saved = {
      _id: "650000000000000000000501",
      stationId: "88:a2:9e:d0:95:ec",
      qrMetadata: { ref_no: "AK3984", sku: "G_OK8478", length: 78, breadth: 78, height: 6 },
      measuredData: {},
      status: "pending",
    };
    mocks.create.mockResolvedValue({ toObject: () => saved });
    const res = responseDouble();
    await service.createFromQr({
      ...identity,
      body: {
        stationId: "88:a2:9e:d0:95:ec",
        qrImagePath: "http://backend:5055/api/v2/measurements/captures/qr.jpg",
        qrImage: {
          url: "http://backend:5055/api/v2/measurements/captures/qr.jpg",
          filename: "qr.jpg",
        },
        qrMetadata: saved.qrMetadata,
      },
    }, res);

    expect(res.statusCode).toBe(201);
    expect(mocks.processWithDs).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      qrSku: "G_OK8478",
      qrImagePath: "/api/v2/measurements/captures/qr.jpg",
      qrImage: { url: "/api/v2/measurements/captures/qr.jpg", filename: "qr.jpg" },
      qrMetadata: saved.qrMetadata,
      measuredData: {},
      measurementImage: null,
      status: "pending",
      dsProcessedAt: null,
    }));
    expect(mocks.sendMeasurement).toHaveBeenCalledWith("88:a2:9e:d0:95:ec", saved);
  });

  it("stores a valid DS response and emits the saved document on measurement", async () => {
    mocks.processWithDs.mockResolvedValue({
      qrMetadata: { sku: "G_OS7242-5" },
      measuredData: { length: 182.9, width: 106.7, height: 12.8 },
    });
    const saved = {
      _id: "650000000000000000000501",
      status: "pending",
      qrMetadata: { sku: "G_OS7242-5" },
      measuredData: { length: 182.9, width: 106.7, height: 12.8 },
    };
    mocks.create.mockResolvedValue({ toObject: () => saved });
    const req = {
      ...identity,
      body: {
        stationId: "L2-QC-01",
        qrImagePath: "/measurement-qr/qr.png",
        operatorId: "operator-1",
        payload: { cycleId: "cycle-1", stationId: "cannot-override" },
      },
    };
    const res = responseDouble();

    await service.process(req, res);

    expect(res.statusCode).toBe(201);
    expect(mocks.processWithDs).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-1",
      stationId: "L2-QC-01",
      qrImagePath: "/measurement-qr/qr.png",
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      adminId: "650000000000000000000001",
      userId: "1234",
      qrMetadata: { sku: "G_OS7242-5" },
    }));
    expect(mocks.sendPayloadToUser).toHaveBeenCalledWith("1234", "measurement", saved);
    expect(mocks.sendMeasurement).toHaveBeenCalledWith("L2-QC-01", saved);
  });

  it("does not persist or emit an invalid DS response", async () => {
    mocks.processWithDs.mockResolvedValue({ qrMetadata: {}, measuredData: {} });
    const res = responseDouble();

    await service.process({
      ...identity,
      body: { stationId: "L2-QC-01", qrImagePath: "/qr.png" },
    }, res);

    expect(res.statusCode).toBe(502);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sendPayloadToUser).not.toHaveBeenCalled();
  });

  it("updates status using an owner-scoped query", async () => {
    const updated = { _id: "650000000000000000000501", status: "rejected" };
    mocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
    const res = responseDouble();

    await service.updateStatus({
      ...identity,
      params: { id: "650000000000000000000501" },
      body: { status: "rejected" },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "650000000000000000000501",
        $or: expect.arrayContaining([
          { adminId: "650000000000000000000001" },
          { userId: "1234" },
        ]),
      }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "rejected" }) }),
      { new: true, runValidators: true },
    );
  });

  it("stores DS measured data and emits the updated incident", async () => {
    const updated = {
      _id: "650000000000000000000501",
      stationId: "88:a2:9e:d0:95:ec",
      measuredData: { length: 77.9, breadth: 78.1, height: 6.1 },
    };
    mocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
    const res = responseDouble();
    await service.updateMeasurement({
      ...identity,
      params: { id: updated._id },
      body: { measuredData: updated.measuredData },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: updated._id }),
      expect.objectContaining({ $set: expect.objectContaining({ measuredData: updated.measuredData }) }),
      { new: true, runValidators: true },
    );
    expect(mocks.sendMeasurement).toHaveBeenCalledWith(updated.stationId, updated);
  });

  it("updates the newest pending incident using only its SKU", async () => {
    const updated = {
      _id: "650000000000000000000501",
      qrSku: "G_OK8478",
      stationId: "88:a2:9e:d0:95:ec",
      measuredData: { length: 77.9, breadth: 78.1, height: 6.1 },
    };
    mocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
    const res = responseDouble();
    await service.updateMeasurementBySku({
      verified: { userData: { system: true, service: "python-backend" } },
      params: { sku: "g_ok8478" },
      body: {
        measuredData: updated.measuredData,
        measurementImage: { url: "http://pi/results/G_OK8478.jpg" },
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { qrSku: "G_OK8478", status: "pending" },
      expect.objectContaining({
        $set: expect.objectContaining({
          measuredData: updated.measuredData,
          measurementImage: "http://pi/results/G_OK8478.jpg",
        }),
      }),
      { new: true, runValidators: true, sort: { createdAt: -1 } },
    );
    expect(mocks.sendMeasurement).toHaveBeenCalledWith(updated.stationId, updated);
  });

  it("does not let a descriptive DS station alias block the SKU match", async () => {
    const updated = {
      _id: "650000000000000000000502",
      qrSku: "AGS7536-8",
      stationId: "88:a2:9e:d0:95:ec",
      measuredData: { length: 77.9, breadth: 78.1, height: 6.1 },
    };
    mocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
    const res = responseDouble();

    await service.updateMeasurementBySku({
      verified: { userData: { system: true, service: "python-backend" } },
      params: { sku: "ags7536-8" },
      body: {
        measuredData: updated.measuredData,
        stationId: "intel-depth-sensing-pi",
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { qrSku: "AGS7536-8", status: "pending" },
      expect.any(Object),
      { new: true, runValidators: true, sort: { createdAt: -1 } },
    );
  });

  it("fetches the newest incident by normalized SKU and station token", async () => {
    const found = {
      _id: "650000000000000000000501",
      qrSku: "G_OK8478",
      stationId: "88:a2:9e:d0:95:ec",
      measuredData: { length: 77.9 },
    };
    const lean = vi.fn().mockResolvedValue(found);
    const sort = vi.fn().mockReturnValue({ lean });
    mocks.findOne.mockReturnValue({ sort });
    const res = responseDouble();

    await service.findLatestBySku({
      verified: {
        userData: {
          adminId: "650000000000000000000001",
          stationId: "88:A2:9E:D0:95:EC",
        },
      },
      params: { sku: "g_ok8478" },
      query: {},
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOne).toHaveBeenCalledWith({
      qrSku: "G_OK8478",
      stationId: "88:a2:9e:d0:95:ec",
      $or: [
        { adminId: "650000000000000000000001" },
        { stationId: "88:a2:9e:d0:95:ec" },
      ],
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.payload.body.data).toEqual(found);
  });

  it("lists newest incidents using station and owner scoping", async () => {
    const items = [{ _id: "650000000000000000000501", status: "accepted" }];
    const lean = vi.fn().mockResolvedValue(items);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    mocks.find.mockReturnValue({ sort });
    mocks.countDocuments.mockResolvedValue(1);
    const res = responseDouble();

    await service.list({
      verified: { userData: { adminId: "650000000000000000000001", stationId: "88:A2:9E:D0:95:EC" } },
      query: { page: "1", limit: "20" },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({
      stationId: "88:a2:9e:d0:95:ec",
      $or: [
        { adminId: "650000000000000000000001" },
        { stationId: "88:a2:9e:d0:95:ec" },
      ],
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(20);
    expect(res.payload.body.data).toEqual({
      items,
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it("deletes the owned document on reset", async () => {
    mocks.findOneAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "650000000000000000000501" }),
    });
    const res = responseDouble();

    await service.reset({
      ...identity,
      params: { id: "650000000000000000000501" },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOneAndDelete).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "650000000000000000000501" }),
    );
  });
});
