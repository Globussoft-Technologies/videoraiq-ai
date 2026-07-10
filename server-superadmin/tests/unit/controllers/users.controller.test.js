/**
 * Unit coverage for core/v1/users/users.controller.js.
 *
 * Every handler is a thin pass-through to authorizedUsersService (imported
 * from `users.service.js`) — the controller simply does
 * `return authorizedUsersService.<method>(req, res, next)`. We mock the
 * service so we exercise only the controller's own delegation wiring and
 * catch any swapped method names.
 *
 * Note: this targets `core/v1/users/` (different module from
 * `core/v1/authorizedUsers/` which has its own controller test).
 *
 * Style mirrors storage.controller.test.js (R56) and the other thin
 * controller unit suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/users/users.service.js", () => ({
  default: {
    fetchAuthUser: vi.fn(),
    createAuthUser: vi.fn(),
    updateAuthUser: vi.fn(),
    deleteAuthUser: vi.fn(),
    authUserLogin: vi.fn(),
    bulkDeleteAuthUser: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    checkEmpAdmin: vi.fn(),
    isEmailExist: vi.fn(),
    allOrgEmployee: vi.fn(),
    importUsers: vi.fn(),
    getImportProgress: vi.fn(),
  },
}));

import authorizedUsersService from "../../../core/v1/users/users.service.js";
const { default: userController } = await import(
  "../../../core/v1/users/users.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "fetchAuthUser",
  "createAuthUser",
  "updateAuthUser",
  "deleteAuthUser",
  "authUserLogin",
  "bulkDeleteAuthUser",
  "forgotPassword",
  "resetPassword",
  "changePassword",
  "checkEmpAdmin",
  "isEmailExist",
  "allOrgEmployee",
  "importUsers",
  "getImportProgress",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(authorizedUsersService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("userController (core/v1/users)", () => {
  describe("fetchAuthUser", () => {
    it("delegates to authorizedUsersService.fetchAuthUser and returns its result", async () => {
      authorizedUsersService.fetchAuthUser.mockResolvedValueOnce({
        data: [{ _id: "u1" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: 0, limit: 10, orderBy: "userName", sort: "asc" };

      const out = await userController.fetchAuthUser(req, res, next);

      expect(out).toEqual({ data: [{ _id: "u1" }], total: 1 });
      expect(authorizedUsersService.fetchAuthUser).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.fetchAuthUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchAuthUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.fetchAuthUser.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.fetchAuthUser(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("createAuthUser", () => {
    it("delegates to authorizedUsersService.createAuthUser and returns its result", async () => {
      authorizedUsersService.createAuthUser.mockResolvedValueOnce({
        success: true,
        id: "u_new",
      });
      const { req, res, next } = makeReqRes();
      req.body = { email: "new@x.com", firstName: "N", lastName: "U" };

      const out = await userController.createAuthUser(req, res, next);

      expect(out).toEqual({ success: true, id: "u_new" });
      expect(authorizedUsersService.createAuthUser).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.createAuthUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createAuthUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.createAuthUser.mockRejectedValueOnce(
        new Error("duplicate email")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.createAuthUser(req, res, next)
      ).rejects.toThrow("duplicate email");
    });
  });

  describe("updateAuthUser", () => {
    it("delegates to authorizedUsersService.updateAuthUser and returns its result", async () => {
      authorizedUsersService.updateAuthUser.mockResolvedValueOnce({
        success: true,
        updated: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { userId: "6881d0279df7d83a343bfa72" };
      req.body = { firstName: "Renamed" };

      const out = await userController.updateAuthUser(req, res, next);

      expect(out).toEqual({ success: true, updated: 1 });
      expect(authorizedUsersService.updateAuthUser).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.updateAuthUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateAuthUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.updateAuthUser.mockRejectedValueOnce(
        new Error("update failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.updateAuthUser(req, res, next)
      ).rejects.toThrow("update failed");
    });
  });

  describe("deleteAuthUser", () => {
    it("delegates to authorizedUsersService.deleteAuthUser and returns its result", async () => {
      authorizedUsersService.deleteAuthUser.mockResolvedValueOnce({
        success: true,
        deleted: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { userId: "6881d0279df7d83a343bfa72" };

      const out = await userController.deleteAuthUser(req, res, next);

      expect(out).toEqual({ success: true, deleted: 1 });
      expect(authorizedUsersService.deleteAuthUser).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.deleteAuthUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteAuthUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.deleteAuthUser.mockRejectedValueOnce(
        new Error("user not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.deleteAuthUser(req, res, next)
      ).rejects.toThrow("user not found");
    });
  });

  describe("authUserLogin", () => {
    it("delegates to authorizedUsersService.authUserLogin and returns its result", async () => {
      authorizedUsersService.authUserLogin.mockResolvedValueOnce({
        success: true,
        token: "jwt-x",
      });
      const { req, res, next } = makeReqRes();
      req.body = { email: "x@y.com", password: "secret" };

      const out = await userController.authUserLogin(req, res, next);

      expect(out).toEqual({ success: true, token: "jwt-x" });
      expect(authorizedUsersService.authUserLogin).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.authUserLogin).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("authUserLogin");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.authUserLogin.mockRejectedValueOnce(
        new Error("invalid credentials")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.authUserLogin(req, res, next)
      ).rejects.toThrow("invalid credentials");
    });
  });

  describe("bulkDeleteAuthUser", () => {
    it("delegates to authorizedUsersService.bulkDeleteAuthUser and returns its result", async () => {
      authorizedUsersService.bulkDeleteAuthUser.mockResolvedValueOnce({
        success: true,
        deleted: 3,
      });
      const { req, res, next } = makeReqRes();
      req.body = { ids: ["u1", "u2", "u3"] };

      const out = await userController.bulkDeleteAuthUser(req, res, next);

      expect(out).toEqual({ success: true, deleted: 3 });
      expect(authorizedUsersService.bulkDeleteAuthUser).toHaveBeenCalledTimes(
        1
      );
      expect(authorizedUsersService.bulkDeleteAuthUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkDeleteAuthUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.bulkDeleteAuthUser.mockRejectedValueOnce(
        new Error("bulk delete failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.bulkDeleteAuthUser(req, res, next)
      ).rejects.toThrow("bulk delete failed");
    });
  });

  describe("forgotPassword", () => {
    it("delegates to authorizedUsersService.forgotPassword and returns its result", async () => {
      authorizedUsersService.forgotPassword.mockResolvedValueOnce({
        success: true,
      });
      const { req, res, next } = makeReqRes();
      req.body = { email: "x@y.com" };

      const out = await userController.forgotPassword(req, res, next);

      expect(out).toEqual({ success: true });
      expect(authorizedUsersService.forgotPassword).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.forgotPassword).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("forgotPassword");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.forgotPassword.mockRejectedValueOnce(
        new Error("email not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.forgotPassword(req, res, next)
      ).rejects.toThrow("email not found");
    });
  });

  describe("resetPassword", () => {
    it("delegates to authorizedUsersService.resetPassword and returns its result", async () => {
      authorizedUsersService.resetPassword.mockResolvedValueOnce({
        success: true,
      });
      const { req, res, next } = makeReqRes();
      req.body = { token: "reset-token", password: "new-pass" };

      const out = await userController.resetPassword(req, res, next);

      expect(out).toEqual({ success: true });
      expect(authorizedUsersService.resetPassword).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.resetPassword).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("resetPassword");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.resetPassword.mockRejectedValueOnce(
        new Error("invalid token")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.resetPassword(req, res, next)
      ).rejects.toThrow("invalid token");
    });
  });

  describe("changePassword", () => {
    it("delegates to authorizedUsersService.changePassword and returns its result", async () => {
      authorizedUsersService.changePassword.mockResolvedValueOnce({
        success: true,
      });
      const { req, res, next } = makeReqRes();
      req.body = { oldPassword: "old", newPassword: "new" };

      const out = await userController.changePassword(req, res, next);

      expect(out).toEqual({ success: true });
      expect(authorizedUsersService.changePassword).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.changePassword).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("changePassword");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.changePassword.mockRejectedValueOnce(
        new Error("wrong password")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.changePassword(req, res, next)
      ).rejects.toThrow("wrong password");
    });
  });

  describe("checkEmpAdmin", () => {
    it("delegates to authorizedUsersService.checkEmpAdmin and returns its result", async () => {
      authorizedUsersService.checkEmpAdmin.mockResolvedValueOnce({
        isEmpAdmin: true,
      });
      const { req, res, next } = makeReqRes();
      req.body = { email: "admin@x.com" };

      const out = await userController.checkEmpAdmin(req, res, next);

      expect(out).toEqual({ isEmpAdmin: true });
      expect(authorizedUsersService.checkEmpAdmin).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.checkEmpAdmin).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("checkEmpAdmin");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.checkEmpAdmin.mockRejectedValueOnce(
        new Error("lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.checkEmpAdmin(req, res, next)
      ).rejects.toThrow("lookup failed");
    });
  });

  describe("isEmailExist", () => {
    it("delegates to authorizedUsersService.isEmailExist and returns its result", async () => {
      authorizedUsersService.isEmailExist.mockResolvedValueOnce({
        exists: false,
      });
      const { req, res, next } = makeReqRes();
      req.query = { email: "x@y.com" };

      const out = await userController.isEmailExist(req, res, next);

      expect(out).toEqual({ exists: false });
      expect(authorizedUsersService.isEmailExist).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.isEmailExist).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("isEmailExist");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.isEmailExist.mockRejectedValueOnce(
        new Error("lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.isEmailExist(req, res, next)
      ).rejects.toThrow("lookup failed");
    });
  });

  describe("allOrgEmployee", () => {
    it("delegates to authorizedUsersService.allOrgEmployee and returns its result", async () => {
      authorizedUsersService.allOrgEmployee.mockResolvedValueOnce({
        data: [{ _id: "e1" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = { adminId: "a1" };

      const out = await userController.allOrgEmployee(req, res, next);

      expect(out).toEqual({ data: [{ _id: "e1" }], total: 1 });
      expect(authorizedUsersService.allOrgEmployee).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.allOrgEmployee).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("allOrgEmployee");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.allOrgEmployee.mockRejectedValueOnce(
        new Error("org query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.allOrgEmployee(req, res, next)
      ).rejects.toThrow("org query failed");
    });
  });

  describe("importUsers", () => {
    it("delegates to authorizedUsersService.importUsers and returns its result", async () => {
      authorizedUsersService.importUsers.mockResolvedValueOnce({
        success: true,
        jobId: "job_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = { source: "EmpMonitor" };

      const out = await userController.importUsers(req, res, next);

      expect(out).toEqual({ success: true, jobId: "job_1" });
      expect(authorizedUsersService.importUsers).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.importUsers).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("importUsers");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.importUsers.mockRejectedValueOnce(
        new Error("import failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.importUsers(req, res, next)
      ).rejects.toThrow("import failed");
    });
  });

  describe("getImportProgress", () => {
    it("delegates to authorizedUsersService.getImportProgress and returns its result", async () => {
      authorizedUsersService.getImportProgress.mockResolvedValueOnce({
        progress: 42,
      });
      const { req, res, next } = makeReqRes();

      const out = await userController.getImportProgress(req, res, next);

      expect(out).toEqual({ progress: 42 });
      expect(authorizedUsersService.getImportProgress).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.getImportProgress).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getImportProgress");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.getImportProgress.mockRejectedValueOnce(
        new Error("progress lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        userController.getImportProgress(req, res, next)
      ).rejects.toThrow("progress lookup failed");
    });
  });
});
