/**
 * Real vertical Supertest contract for `/api/v1/domain` — mounts the real
 * router on a fresh Express app and exercises the actual controller +
 * `DomainService.registerDomain` end-to-end. Targets `domain.controller.js`
 * (0% covered).
 *
 * Mocks:
 *   1. mailService/mail.helper.js          — stub `sendDomainIp`
 *   2. services/telegram.service.js        — stub `sendDomainRegistration`
 *
 * Total: 2 mocks. Everything else (Joi validation, response wrapper,
 * controller pass-through) runs for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../mailService/mail.helper.js", () => ({
  default: { sendDomainIp: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../services/telegram.service.js", () => ({
  default: { sendDomainRegistration: vi.fn().mockResolvedValue(undefined) },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: domainRoutes } = await import(
  "../../core/v1/domain/domain.routes.js"
);
const mailHelper = (await import("../../mailService/mail.helper.js")).default;
const telegramService = (await import("../../services/telegram.service.js"))
  .default;

let app;
beforeEach(() => {
  vi.clearAllMocks();
  app = buildApp((a) => a.use("/api/v1/domain", domainRoutes));
});

describe("POST /api/v1/domain/register (real vertical)", () => {
  it("returns 200 and calls mail + telegram for a valid payload", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({
        domainName: "https://example.com",
        ip: "10.0.0.1",
        port: 8080,
      });
    expect(res.status).toBe(200);
    expect(res.body.body.status).toBe("success");
    expect(mailHelper.sendDomainIp).toHaveBeenCalledWith(
      "https://example.com",
      "10.0.0.1",
      8080,
    );
    expect(telegramService.sendDomainRegistration).toHaveBeenCalledWith(
      "https://example.com",
      "10.0.0.1",
      8080,
    );
  });

  it("returns 400 when payload is empty", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({});
    expect(res.status).toBe(400);
    expect(mailHelper.sendDomainIp).not.toHaveBeenCalled();
    expect(telegramService.sendDomainRegistration).not.toHaveBeenCalled();
  });

  it("returns 400 when ip is malformed", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({
        domainName: "https://example.com",
        ip: "999.999.999.999",
        port: 80,
      });
    expect(res.status).toBe(400);
    expect(mailHelper.sendDomainIp).not.toHaveBeenCalled();
  });

  it("returns 400 when port is out of range", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({
        domainName: "https://example.com",
        ip: "127.0.0.1",
        port: 99999,
      });
    expect(res.status).toBe(400);
    expect(mailHelper.sendDomainIp).not.toHaveBeenCalled();
  });

  it("returns 400 when domainName is not a URI", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({ domainName: "not-a-url", ip: "127.0.0.1", port: 80 });
    expect(res.status).toBe(400);
  });

  it("returns 500 when mailHelper throws", async () => {
    mailHelper.sendDomainIp.mockRejectedValueOnce(new Error("smtp blew up"));
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({
        domainName: "https://example.com",
        ip: "10.0.0.1",
        port: 8080,
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("smtp blew up");
  });

  it("accepts an IPv6 address", async () => {
    const res = await request(app)
      .post("/api/v1/domain/register")
      .send({
        domainName: "https://example.com",
        ip: "2001:db8::1",
        port: 443,
      });
    expect(res.status).toBe(200);
    expect(mailHelper.sendDomainIp).toHaveBeenCalled();
  });
});
