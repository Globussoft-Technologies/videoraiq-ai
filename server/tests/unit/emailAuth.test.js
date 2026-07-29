import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  login,
  requireEmailAuth,
} from "../../core/v2/emailMonitoring/emailAuth.js";

const SECRET = "test-email-monitoring-secret";

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const sign = (payload, secret = SECRET) =>
  jwt.sign(payload, secret, { algorithm: "HS512", expiresIn: "1d" });

describe("email monitoring login", () => {
  it("issues a 1-day token for the configured credentials", () => {
    const res = mockRes();
    login({ body: { username: "opsadmin", password: "test-email-pass" } }, res);

    expect(res.status).not.toHaveBeenCalled();
    const { token, expiresIn } = res.json.mock.calls[0][0];
    expect(expiresIn).toBe(86_400);

    const claims = jwt.verify(token, SECRET, { algorithms: ["HS512"] });
    expect(claims.sub).toBe("opsadmin");
    expect(claims.scope).toBe("email-monitoring");
    expect(claims.exp - claims.iat).toBe(86_400);
  });

  it("rejects a wrong password", () => {
    const res = mockRes();
    login({ body: { username: "opsadmin", password: "nope" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects an unknown username", () => {
    const res = mockRes();
    login({ body: { username: "someone", password: "test-email-pass" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects an empty body without throwing", () => {
    const res = mockRes();
    login({}, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("requireEmailAuth", () => {
  const run = (authorization) => {
    const req = { headers: authorization ? { authorization } : {} };
    const res = mockRes();
    const next = vi.fn();
    requireEmailAuth(req, res, next);
    return { req, res, next };
  };

  it("accepts a token minted by login", () => {
    const res0 = mockRes();
    login({ body: { username: "opsadmin", password: "test-email-pass" } }, res0);
    const { token } = res0.json.mock.calls[0][0];

    const { req, next, res } = run(`Bearer ${token}`);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.emailUser).toBe("opsadmin");
  });

  it("rejects a missing token", () => {
    const { next, res } = run(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // The dashboard secret is separate from token_secret precisely so a main-app
  // token cannot open this door.
  it("rejects a token signed with a different secret", () => {
    const token = sign({ sub: "opsadmin", scope: "email-monitoring" }, "some-other-secret");
    const { next, res } = run(`Bearer ${token}`);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a correctly-signed token carrying the wrong scope", () => {
    const token = sign({ sub: "opsadmin", scope: "main-app" });
    const { next, res } = run(`Bearer ${token}`);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: "opsadmin", scope: "email-monitoring" }, SECRET, {
      algorithm: "HS512",
      expiresIn: "-1s",
    });
    const { next, res } = run(`Bearer ${token}`);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
