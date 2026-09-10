import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { encrypt } from "../../utils/cryptoUtils.js";

const mocks = vi.hoisted(() => ({ findOne: vi.fn() }));
vi.mock("../../core/v2/raspberryPi/raspberryPi.model.js", () => ({
  default: { findOne: mocks.findOne },
}));

const { default: verifyStationToken } = await import(
  "../../core/v2/measurements/stationToken.middleware.js"
);

function run(token) {
  const req = {
    get(name) { return name.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined; },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

beforeEach(() => vi.clearAllMocks());

describe("approved station Bearer token", () => {
  it("accepts the exact persisted token for an approved MAC", async () => {
    const token = jwt.sign(
      { tokenType: "raspberry-pi", stationId: "aa:bb:cc:dd:ee:ff" },
      globalThis.__TEST_CONFIG__.jwt.secretKey,
      { algorithm: "HS512" },
    );
    const device = { approvalStatus: "approved", tokenEncrypted: encrypt(token) };
    mocks.findOne.mockResolvedValue(device);
    const { req, res, next } = run(token);

    await verifyStationToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.stationDevice).toBe(device);
    expect(mocks.findOne).toHaveBeenCalledWith(expect.objectContaining({
      approvalStatus: "approved",
    }));
  });

  it("rejects a token when the station is not approved", async () => {
    const token = jwt.sign(
      { tokenType: "raspberry-pi", stationId: "aa:bb:cc:dd:ee:ff" },
      globalThis.__TEST_CONFIG__.jwt.secretKey,
      { algorithm: "HS512" },
    );
    mocks.findOne.mockResolvedValue(null);
    const { res, next, ...context } = run(token);

    await verifyStationToken(context.req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
