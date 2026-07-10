/**
 * Unit coverage for core/v1/domain/domain.controller.js.
 *
 * The controller is a single-method pass-through: `registerDomain` returns
 * `DomainService.registerDomain(req, res, next)` verbatim. We mock the
 * service module so only the controller's own delegation logic runs; the
 * service itself (which fans out to mailHelper + telegramService) is
 * integration-tested elsewhere.
 *
 * For the single controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service.
 *
 * Style mirrors detectionSettings.controller.test.js (R42 reference) and
 * shifts.controller.test.js (R41 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/domain/domain.service.js", () => ({
  default: {
    registerDomain: vi.fn(),
  },
}));

import DomainService from "../../../core/v1/domain/domain.service.js";
const { default: domainController } = await import(
  "../../../core/v1/domain/domain.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DomainController", () => {
  describe("registerDomain", () => {
    it("delegates to DomainService.registerDomain and returns its result", async () => {
      DomainService.registerDomain.mockResolvedValueOnce({
        status: 200,
        body: {
          success: true,
          message: "Domain and ip sent successfully.",
        },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        domainName: "example.videoraiq.com",
        ip: "203.0.113.10",
        port: 8443,
      };

      const out = await domainController.registerDomain(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: {
          success: true,
          message: "Domain and ip sent successfully.",
        },
      });
      expect(DomainService.registerDomain).toHaveBeenCalledTimes(1);
      expect(DomainService.registerDomain).toHaveBeenCalledWith(req, res, next);
    });

    it("propagates rejections from the service", async () => {
      DomainService.registerDomain.mockRejectedValueOnce(
        new Error("mailer offline")
      );
      const { req, res, next } = makeReqRes();
      req.body = {
        domainName: "example.videoraiq.com",
        ip: "203.0.113.10",
        port: 8443,
      };

      await expect(
        domainController.registerDomain(req, res, next)
      ).rejects.toThrow("mailer offline");
      expect(DomainService.registerDomain).toHaveBeenCalledTimes(1);
      expect(DomainService.registerDomain).toHaveBeenCalledWith(req, res, next);
    });
  });
});
