import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { encryptData } from "../../utils/cryptoUtils.js";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  find: vi.fn(),
}));

vi.mock("../../core/v2/raspberryPi/raspberryPi.model.js", () => ({
  default: mocks,
}));

const { default: service } = await import(
  "../../core/v2/raspberryPi/raspberryPi.service.js"
);

function responseDouble() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function request(payload, params = {}) {
  const header = encryptData(payload);
  return {
    params,
    get(name) { return name === "x-raspberry-pi-data" ? header : undefined; },
  };
}

const payload = {
  mac: "AA:BB:CC:DD:EE:FF",
  ip: "192.168.1.50",
  ts: "2026-09-08T10:30:00.000Z",
  station: { id: "L2-QC-01", cameras: [{ id: "top" }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exists.mockResolvedValue(false);
});

describe("Raspberry Pi registration contract", () => {
  it("creates one stable pending registration keyed by normalized MAC", async () => {
    mocks.findOne.mockResolvedValue(null);
    mocks.create.mockImplementation(async (data) => ({ ...data, _id: "device-1" }));
    const res = responseDouble();

    await service.register(request(payload), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ status: "pending", code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/) });
    expect(res.payload.token).toBeUndefined();
    expect(mocks.findOne).toHaveBeenCalledWith({
      $or: [{ mac: "aa:bb:cc:dd:ee:ff" }, { deviceData: "aa:bb:cc:dd:ee:ff" }],
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      mac: "aa:bb:cc:dd:ee:ff",
      deviceData: "aa:bb:cc:dd:ee:ff",
      approvalStatus: "pending",
    }));
  });

  it("keeps an approved device approved during re-register and returns a Bearer-ready token", async () => {
    const device = {
      _id: "device-1",
      mac: "aa:bb:cc:dd:ee:ff",
      code: "123456",
      approvalStatus: "approved",
      tokenEncrypted: null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.findOne.mockResolvedValue(device);
    const res = responseDouble();

    await service.register(request({ ...payload, ts: Date.now() }), res);

    expect(res.payload).toMatchObject({ status: "approved", code: "123456" });
    const claims = jwt.verify(res.payload.token, globalThis.__TEST_CONFIG__.jwt.secretKey);
    expect(claims).toMatchObject({ tokenType: "raspberry-pi", stationId: "aa:bb:cc:dd:ee:ff" });
    expect(device.approvalStatus).toBe("approved");
    expect(device.tokenEncrypted).toEqual(expect.any(String));
  });

  it("returns approved status and token from GET status without changing approval", async () => {
    const approvedToken = await (async () => {
      const device = {
        _id: "device-1",
        mac: "aa:bb:cc:dd:ee:ff",
        code: "123456",
        approvalStatus: "approved",
        tokenEncrypted: null,
        save: vi.fn().mockResolvedValue(undefined),
      };
      return { device, token: await service.stationToken(device) };
    })();
    mocks.findOne.mockResolvedValue(approvedToken.device);
    const res = responseDouble();

    await service.registrationStatus({ params: { code: "123456" } }, res);

    expect(res.payload).toEqual({
      status: "approved",
      code: "123456",
      token: approvedToken.token,
    });
  });

  it("lets an administrator claim and approve a pending pairing code", async () => {
    const approved = {
      _id: "device-1",
      code: "123456",
      mac: "aa:bb:cc:dd:ee:ff",
      ip: "192.168.1.50",
      approvalStatus: "approved",
      status: "connected",
    };
    mocks.findOneAndUpdate.mockResolvedValue(approved);
    const res = responseDouble();

    await service.updateApproval({
      verified: { userData: { adminId: "650000000000000000000001" } },
      params: { code: "123456" },
      body: { status: "approved" },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      {
        code: "123456",
        $or: [{ admin: null }, { admin: "650000000000000000000001" }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          admin: "650000000000000000000001",
          approvalStatus: "approved",
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(res.payload).toMatchObject({ status: "success", data: { code: "123456", approvalStatus: "approved" } });
  });

  it("rejecting a paired device invalidates its station token", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({
      _id: "device-1",
      code: "123456",
      mac: "aa:bb:cc:dd:ee:ff",
      approvalStatus: "rejected",
    });
    const res = responseDouble();

    await service.updateApproval({
      verified: { userData: { adminId: "650000000000000000000001" } },
      params: { code: "123456" },
      body: { status: "rejected" },
    }, res);

    expect(mocks.findOneAndUpdate.mock.calls[0][1].$unset).toEqual({ tokenEncrypted: 1 });
    expect(res.payload.data.approvalStatus).toBe("rejected");
  });

  it("automatically lists unclaimed requests and this administrator's devices", async () => {
    const lean = vi.fn().mockResolvedValue([
      { _id: "device-1", code: "V9WEW4", mac: "aa:bb:cc:dd:ee:ff", approvalStatus: "pending" },
    ]);
    const sort = vi.fn().mockReturnValue({ lean });
    mocks.find.mockReturnValue({ sort });
    const res = responseDouble();

    await service.adminRegistrations({
      verified: { userData: { adminId: "650000000000000000000001" } },
      query: {},
    }, res);

    expect(mocks.find).toHaveBeenCalledWith({
      $or: [{ admin: null }, { admin: "650000000000000000000001" }],
    });
    expect(sort).toHaveBeenCalledWith({ approvalStatus: 1, createdAt: -1 });
    expect(res.payload.data).toEqual([
      expect.objectContaining({ code: "V9WEW4", approvalStatus: "pending" }),
    ]);
  });

  it("lets an administrator delete their Raspberry Pi connection", async () => {
    mocks.findOneAndDelete.mockResolvedValue({
      code: "592JV6",
      mac: "aa:bb:cc:dd:ee:ff",
    });
    const res = responseDouble();

    await service.deleteRegistration({
      verified: { userData: { adminId: "650000000000000000000001" } },
      params: { code: "592jv6" },
    }, res);

    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({
      code: "592JV6",
      $or: [{ admin: null }, { admin: "650000000000000000000001" }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      status: "success",
      message: "Raspberry Pi connection deleted",
      data: { code: "592JV6", mac: "aa:bb:cc:dd:ee:ff" },
    });
  });
});
