/**
 * Unit coverage for core/v1/permission/permissions.controller.js.
 *
 * The controller is a thin pass-through to PermissionService (exported
 * from `permissions.utility.js`) — every handler simply
 * `return PermissionService.<method>(req, res, next)`. We mock the
 * utility module so only the controller's own delegation logic is
 * exercised; the service itself is integration-tested elsewhere.
 *
 * Confirms that every controller method:
 *   - forwards the same (req, res, next) it received,
 *   - returns whatever the service returned,
 *   - propagates rejections from the service,
 *   - does not accidentally call sibling service methods.
 *
 * Style mirrors roles.controller.test.js (R30) and
 * departments.controller.test.js (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/permission/permissions.utility.js", () => ({
  default: {
    create: vi.fn(),
    fetchPermissions: vi.fn(),
    updatePermissions: vi.fn(),
    deletePermissions: vi.fn(),
    fetchRolesPermission: vi.fn(),
    bulkPermissionUpdate: vi.fn(),
    bulkPermissionDelete: vi.fn(),
    userPermissions: vi.fn(),
    updateAdminPermissions: vi.fn(),
  },
}));

import PermissionService from "../../../core/v1/permission/permissions.utility.js";
const { default: permissionsController } = await import(
  "../../../core/v1/permission/permissions.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "create",
  "fetchPermissions",
  "updatePermissions",
  "deletePermissions",
  "fetchRolesPermission",
  "bulkPermissionUpdate",
  "bulkPermissionDelete",
  "userPermissions",
  "updateAdminPermissions",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(PermissionService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PermissionController", () => {
  describe("create", () => {
    it("delegates to PermissionService.create and returns its result", async () => {
      PermissionService.create.mockResolvedValueOnce({
        inserted: 1,
        permissionName: "ManageCameras",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        permissionName: "ManageCameras",
        permissionConfig: { NVR: { view: true } },
      };

      const out = await permissionsController.create(req, res, next);

      expect(out).toEqual({ inserted: 1, permissionName: "ManageCameras" });
      expect(PermissionService.create).toHaveBeenCalledTimes(1);
      expect(PermissionService.create).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("create");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.create.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.create(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("fetchPermissions", () => {
    it("delegates to PermissionService.fetchPermissions and returns its result", async () => {
      PermissionService.fetchPermissions.mockResolvedValueOnce({
        data: [{ _id: "perm_1", permissionName: "ManageCameras" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        skip: "0",
        limit: "10",
        orderBy: "permissionName",
        sort: "asc",
      };

      const out = await permissionsController.fetchPermissions(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "perm_1", permissionName: "ManageCameras" }],
        total: 1,
      });
      expect(PermissionService.fetchPermissions).toHaveBeenCalledTimes(1);
      expect(PermissionService.fetchPermissions).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchPermissions");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.fetchPermissions.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.fetchPermissions(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("updatePermissions", () => {
    it("delegates to PermissionService.updatePermissions and returns its result", async () => {
      PermissionService.updatePermissions.mockResolvedValueOnce({
        _id: "perm_1",
        permissionName: "ManageCamerasV2",
      });
      const { req, res, next } = makeReqRes();
      req.query = { permissionId: "perm_1" };
      req.body = { permissionName: "ManageCamerasV2" };

      const out = await permissionsController.updatePermissions(
        req,
        res,
        next
      );

      expect(out).toEqual({ _id: "perm_1", permissionName: "ManageCamerasV2" });
      expect(PermissionService.updatePermissions).toHaveBeenCalledTimes(1);
      expect(PermissionService.updatePermissions).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updatePermissions");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.updatePermissions.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.updatePermissions(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("deletePermissions", () => {
    it("delegates to PermissionService.deletePermissions and returns its result", async () => {
      PermissionService.deletePermissions.mockResolvedValueOnce({
        deleted: 1,
        message: "permission deleted",
      });
      const { req, res, next } = makeReqRes();
      req.query = { permissionId: "perm_1" };

      const out = await permissionsController.deletePermissions(
        req,
        res,
        next
      );

      expect(out).toEqual({ deleted: 1, message: "permission deleted" });
      expect(PermissionService.deletePermissions).toHaveBeenCalledTimes(1);
      expect(PermissionService.deletePermissions).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deletePermissions");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.deletePermissions.mockRejectedValueOnce(
        new Error("permission in use")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.deletePermissions(req, res, next)
      ).rejects.toThrow("permission in use");
    });
  });

  describe("fetchRolesPermission", () => {
    it("delegates to PermissionService.fetchRolesPermission and returns its result", async () => {
      PermissionService.fetchRolesPermission.mockResolvedValueOnce({
        data: [{ _id: "role_1", roleName: "manager", view: true }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        skip: "0",
        limit: "10",
        orderBy: "roleName",
        sort: "asc",
        searchQuery: "man",
      };

      const out = await permissionsController.fetchRolesPermission(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "role_1", roleName: "manager", view: true }],
        total: 1,
      });
      expect(PermissionService.fetchRolesPermission).toHaveBeenCalledTimes(1);
      expect(PermissionService.fetchRolesPermission).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchRolesPermission");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.fetchRolesPermission.mockRejectedValueOnce(
        new Error("aggregation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.fetchRolesPermission(req, res, next)
      ).rejects.toThrow("aggregation failed");
    });
  });

  describe("bulkPermissionUpdate", () => {
    it("delegates to PermissionService.bulkPermissionUpdate and returns its result", async () => {
      PermissionService.bulkPermissionUpdate.mockResolvedValueOnce({
        modified: 3,
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        roles: [{ roleId: "role_1", permissionConfig: { NVR: { view: true } } }],
      };

      const out = await permissionsController.bulkPermissionUpdate(
        req,
        res,
        next
      );

      expect(out).toEqual({ modified: 3 });
      expect(PermissionService.bulkPermissionUpdate).toHaveBeenCalledTimes(1);
      expect(PermissionService.bulkPermissionUpdate).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkPermissionUpdate");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.bulkPermissionUpdate.mockRejectedValueOnce(
        new Error("bulk write failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.bulkPermissionUpdate(req, res, next)
      ).rejects.toThrow("bulk write failed");
    });
  });

  describe("bulkPermissionDelete", () => {
    it("delegates to PermissionService.bulkPermissionDelete and returns its result", async () => {
      PermissionService.bulkPermissionDelete.mockResolvedValueOnce({
        deleted: 2,
      });
      const { req, res, next } = makeReqRes();
      req.body = { permissionIds: ["perm_1", "perm_2"] };

      const out = await permissionsController.bulkPermissionDelete(
        req,
        res,
        next
      );

      expect(out).toEqual({ deleted: 2 });
      expect(PermissionService.bulkPermissionDelete).toHaveBeenCalledTimes(1);
      expect(PermissionService.bulkPermissionDelete).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkPermissionDelete");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.bulkPermissionDelete.mockRejectedValueOnce(
        new Error("delete blocked")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.bulkPermissionDelete(req, res, next)
      ).rejects.toThrow("delete blocked");
    });
  });

  describe("userPermissions", () => {
    it("delegates to PermissionService.userPermissions and returns its result", async () => {
      PermissionService.userPermissions.mockResolvedValueOnce({
        permissionConfig: { NVR: { view: true } },
      });
      const { req, res, next } = makeReqRes();

      const out = await permissionsController.userPermissions(req, res, next);

      expect(out).toEqual({ permissionConfig: { NVR: { view: true } } });
      expect(PermissionService.userPermissions).toHaveBeenCalledTimes(1);
      expect(PermissionService.userPermissions).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("userPermissions");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.userPermissions.mockRejectedValueOnce(
        new Error("user not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.userPermissions(req, res, next)
      ).rejects.toThrow("user not found");
    });
  });

  describe("updateAdminPermissions", () => {
    it("delegates to PermissionService.updateAdminPermissions and returns its result", async () => {
      PermissionService.updateAdminPermissions.mockResolvedValueOnce({
        modified: 1,
        adminId: "admin_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        adminId: "admin_1",
        permissionConfig: { NVR: { view: true } },
      };

      const out = await permissionsController.updateAdminPermissions(
        req,
        res,
        next
      );

      expect(out).toEqual({ modified: 1, adminId: "admin_1" });
      expect(PermissionService.updateAdminPermissions).toHaveBeenCalledTimes(
        1
      );
      expect(PermissionService.updateAdminPermissions).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateAdminPermissions");
    });

    it("propagates rejections from the service", async () => {
      PermissionService.updateAdminPermissions.mockRejectedValueOnce(
        new Error("admin sync failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        permissionsController.updateAdminPermissions(req, res, next)
      ).rejects.toThrow("admin sync failed");
    });
  });
});
