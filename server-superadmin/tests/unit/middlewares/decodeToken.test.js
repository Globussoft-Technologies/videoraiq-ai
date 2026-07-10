import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { generateToken } from "../../../middlewares/decodeToken.js";

const SECRET = "test-secret-for-decode-token";

describe("decodeToken.generateToken", () => {
  it("produces a verifiable JWT", () => {
    const token = generateToken({ user_id: 7 }, SECRET, "1h");
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.user_id).toBe(7);
  });

  it("signs with the HS512 algorithm", () => {
    const token = generateToken({ a: 1 }, SECRET, "1h");
    const header = JSON.parse(
      Buffer.from(token.split(".")[0], "base64").toString()
    );
    expect(header.alg).toBe("HS512");
  });

  it("embeds an expiry derived from expiryTime", () => {
    const token = generateToken({ a: 1 }, SECRET, "1h");
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it("rejects verification with the wrong secret", () => {
    const token = generateToken({ a: 1 }, SECRET, "1h");
    expect(() => jwt.verify(token, "wrong-secret")).toThrow();
  });

  it("carries the full payload through", () => {
    const payload = { user_id: 1, login: "jane", adminId: "abc" };
    const decoded = jwt.verify(generateToken(payload, SECRET, "2h"), SECRET);
    expect(decoded).toMatchObject(payload);
  });

  it("an expired token fails verification", () => {
    // expiryTime of "0s" → token already expired
    const token = generateToken({ a: 1 }, SECRET, "0s");
    expect(() => jwt.verify(token, SECRET)).toThrow(/expired/i);
  });
});
