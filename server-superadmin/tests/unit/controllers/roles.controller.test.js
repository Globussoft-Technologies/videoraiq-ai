/**
 * Unit coverage for core/v1/roles/roles.controller.js.
 *
 * The controller is a thin pass-through to RolesService — each handler
 * simply `return RolesService.<method>(req, res, next)`. We mock the
 * service module so only the controller's own delegation logic gets
 * exercised; the service itself is integration-tested elsewhere.
 *
 * Confirms that every controller method:
 *   - forwards the same (req, res, next) it received,
 *   - returns whatever the service returned,
 *   - propagates rejections from the service,
 *   - does not accidentally call sibling service methods.
 *
 * Style mirrors departments.controller.test.js (R29) and
 * jobs.controller.test.js (R28).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/roles/roles.service.js", () => ({
  default: {
    createRoles: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import RolesService from "../../../core/v1/roles/roles.service.js";
const { default: rolesController } = await import(
  "../../../core/v1/roles/roles.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RolesController", () => {
  describe("createRoles", () => {
    it("delegates to RolesService.createRoles and returns its result", async () => {
      RolesService.createRoles.mockResolvedValueOnce({
        inserted: 2,
        roles: ["manager", "viewer"],
      });
      const { req, res, next } = makeReqRes();
      req.body = { roles: ["Manager", "Viewer"] };

      const out = await rolesController.createRoles(req, res, next);

      expect(out).toEqual({ inserted: 2, roles: ["manager", "viewer"] });
      expect(RolesService.createRoles).toHaveBeenCalledTimes(1);
      expect(RolesService.createRoles).toHaveBeenCalledWith(req, res, next);
      // sibling methods must not be invoked
      expect(RolesService.get).not.toHaveBeenCalled();
      expect(RolesService.update).not.toHaveBeenCalled();
      expect(RolesService.delete).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      RolesService.createRoles.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        rolesController.createRoles(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("get", () => {
    it("delegates to RolesService.get and returns its result", async () => {
      RolesService.get.mockResolvedValueOnce({
        data: [{ _id: "role_1", roleName: "manager" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10", orderBy: "roleName", sort: "asc" };

      const out = await rolesController.get(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "role_1", roleName: "manager" }],
        total: 1,
      });
      expect(RolesService.get).toHaveBeenCalledTimes(1);
      expect(RolesService.get).toHaveBeenCalledWith(req, res, next);
      expect(RolesService.createRoles).not.toHaveBeenCalled();
      expect(RolesService.update).not.toHaveBeenCalled();
      expect(RolesService.delete).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      RolesService.get.mockRejectedValueOnce(new Error("db unreachable"));
      const { req, res, next } = makeReqRes();
      await expect(rolesController.get(req, res, next)).rejects.toThrow(
        "db unreachable"
      );
    });
  });

  describe("update", () => {
    it("delegates to RolesService.update and returns its result", async () => {
      RolesService.update.mockResolvedValueOnce({
        _id: "role_1",
        roleName: "supervisor",
      });
      const { req, res, next } = makeReqRes();
      req.query = { roleId: "role_1" };
      req.body = { roleName: "Supervisor" };

      const out = await rolesController.update(req, res, next);

      expect(out).toEqual({ _id: "role_1", roleName: "supervisor" });
      expect(RolesService.update).toHaveBeenCalledTimes(1);
      expect(RolesService.update).toHaveBeenCalledWith(req, res, next);
      expect(RolesService.createRoles).not.toHaveBeenCalled();
      expect(RolesService.get).not.toHaveBeenCalled();
      expect(RolesService.delete).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      RolesService.update.mockRejectedValueOnce(new Error("not found"));
      const { req, res, next } = makeReqRes();
      await expect(rolesController.update(req, res, next)).rejects.toThrow(
        "not found"
      );
    });
  });

  describe("delete", () => {
    it("delegates to RolesService.delete and returns its result", async () => {
      RolesService.delete.mockResolvedValueOnce({
        deleted: 1,
        message: "role deleted",
      });
      const { req, res, next } = makeReqRes();
      req.query = { roleId: "role_1" };

      const out = await rolesController.delete(req, res, next);

      expect(out).toEqual({ deleted: 1, message: "role deleted" });
      expect(RolesService.delete).toHaveBeenCalledTimes(1);
      expect(RolesService.delete).toHaveBeenCalledWith(req, res, next);
      expect(RolesService.createRoles).not.toHaveBeenCalled();
      expect(RolesService.get).not.toHaveBeenCalled();
      expect(RolesService.update).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      RolesService.delete.mockRejectedValueOnce(
        new Error("permission denied")
      );
      const { req, res, next } = makeReqRes();
      await expect(rolesController.delete(req, res, next)).rejects.toThrow(
        "permission denied"
      );
    });
  });
});
