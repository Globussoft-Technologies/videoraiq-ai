/**
 * Integration test for DomainService.registerDomain — the validation
 * branches and the happy path. The mail + telegram side effects are mocked.
 */
import { describe, it, expect, vi } from "vitest";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { sendDomainIp: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../../services/telegram.service.js", () => ({
  default: { sendDomainRegistration: vi.fn().mockResolvedValue(undefined) },
}));

const { default: DomainService } = await import(
  "../../../core/v1/domain/domain.service.js"
);

describe("DomainService.registerDomain", () => {
  it("returns 400 for an empty body", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await DomainService.registerDomain(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 400 for an invalid ip address", async () => {
    const { req, res, next } = serviceCtx({
      body: { domainName: "https://example.com", ip: "999.1.1.1", port: 80 },
    });
    await DomainService.registerDomain(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an out-of-range port", async () => {
    const { req, res, next } = serviceCtx({
      body: { domainName: "https://example.com", ip: "10.0.0.1", port: 99999 },
    });
    await DomainService.registerDomain(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("registers a valid domain (200)", async () => {
    const { req, res, next } = serviceCtx({
      body: { domainName: "https://example.com", ip: "10.0.0.1", port: 8080 },
    });
    await DomainService.registerDomain(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });
});
