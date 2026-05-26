/**
 * Unit coverage for core/v1/Auth/auth.controller.js.
 *
 * The controller is a thin pass-through to AUTHService — each handler
 * simply `return await AUTHService.<method>(req, res, next)` (or
 * `return AUTHService.<method>(...)` in the same-shape sync return).
 * We mock the service module so that only the controller's own
 * delegation logic is what gets executed; the service itself is
 * integration-tested elsewhere.
 *
 * Confirms that every controller method:
 *   - forwards the same (req, res, next) it received,
 *   - returns whatever the service returned,
 *   - propagates rejections from the service.
 *
 * Style mirrors uploads.controller.test.js (R26 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/Auth/auth.service.js", () => ({
  default: {
    verifyUser: vi.fn(),
    decodeToken: vi.fn(),
    getAmemberUserDetails: vi.fn(),
  },
}));

import AUTHService from "../../../core/v1/Auth/auth.service.js";
const { default: authController } = await import(
  "../../../core/v1/Auth/auth.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authController", () => {
  describe("verifyUserbyLogin", () => {
    it("delegates to AUTHService.verifyUser and returns its result", async () => {
      AUTHService.verifyUser.mockResolvedValueOnce({ token: "jwt-abc" });
      const { req, res, next } = makeReqRes();
      req.body = { email: "user@test.com", password: "secret" };

      const out = await authController.verifyUserbyLogin(req, res, next);

      expect(out).toEqual({ token: "jwt-abc" });
      expect(AUTHService.verifyUser).toHaveBeenCalledTimes(1);
      expect(AUTHService.verifyUser).toHaveBeenCalledWith(req, res, next);
      // controller must not touch the other service methods
      expect(AUTHService.decodeToken).not.toHaveBeenCalled();
      expect(AUTHService.getAmemberUserDetails).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      AUTHService.verifyUser.mockRejectedValueOnce(
        new Error("invalid credentials")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authController.verifyUserbyLogin(req, res, next)
      ).rejects.toThrow("invalid credentials");
    });
  });

  describe("verifyUserbyDecode", () => {
    it("delegates to AUTHService.decodeToken and returns its result", async () => {
      AUTHService.decodeToken.mockResolvedValueOnce({ user_id: 42 });
      const { req, res, next } = makeReqRes();
      req.body = { token: "encoded.jwt.payload" };

      const out = await authController.verifyUserbyDecode(req, res, next);

      expect(out).toEqual({ user_id: 42 });
      expect(AUTHService.decodeToken).toHaveBeenCalledTimes(1);
      expect(AUTHService.decodeToken).toHaveBeenCalledWith(req, res, next);
      expect(AUTHService.verifyUser).not.toHaveBeenCalled();
      expect(AUTHService.getAmemberUserDetails).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      AUTHService.decodeToken.mockRejectedValueOnce(
        new Error("malformed token")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authController.verifyUserbyDecode(req, res, next)
      ).rejects.toThrow("malformed token");
    });
  });

  describe("getFromAmemberUserDetails", () => {
    it("delegates to AUTHService.getAmemberUserDetails and returns its result", async () => {
      AUTHService.getAmemberUserDetails.mockResolvedValueOnce({
        username: "alice",
        plan: "pro",
      });
      const { req, res, next } = makeReqRes();
      req.params = { username: "alice" };

      const out = await authController.getFromAmemberUserDetails(req, res, next);

      expect(out).toEqual({ username: "alice", plan: "pro" });
      expect(AUTHService.getAmemberUserDetails).toHaveBeenCalledTimes(1);
      expect(AUTHService.getAmemberUserDetails).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expect(AUTHService.verifyUser).not.toHaveBeenCalled();
      expect(AUTHService.decodeToken).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      AUTHService.getAmemberUserDetails.mockRejectedValueOnce(
        new Error("aMember unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authController.getFromAmemberUserDetails(req, res, next)
      ).rejects.toThrow("aMember unreachable");
    });
  });
});
