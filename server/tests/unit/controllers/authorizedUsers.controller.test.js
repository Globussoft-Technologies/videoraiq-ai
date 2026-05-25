/**
 * Unit coverage for core/v1/authorizedUsers/authorizedUsers.controller.js.
 *
 * Every handler is a thin pass-through to authorizedUsersService — the
 * controller simply does `return authorizedUsersService.<method>(req, res, next)`.
 * We mock the service so we exercise only the controller's own delegation
 * wiring and catch any swapped method names.
 *
 * Style mirrors channels.controller.test.js (R49), dashboard (R48),
 * profiles (R47), admin (R46), authorizedObjects (R35).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock(
  "../../../core/v1/authorizedUsers/authorizedUsers.service.js",
  () => ({
    default: {
      deleteAllAuthUsers: vi.fn(),
      fetchAuthUser: vi.fn(),
      createAuthUser: vi.fn(),
      updateAuthUser: vi.fn(),
      deleteAuthUser: vi.fn(),
      authUserLogin: vi.fn(),
      bulkImportAuthUser: vi.fn(),
      fetchUniqueLocations: vi.fn(),
      verifyUser: vi.fn(),
    },
  })
);

import authorizedUsersService from "../../../core/v1/authorizedUsers/authorizedUsers.service.js";
const { default: authorizedUsersController } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "deleteAllAuthUsers",
  "fetchAuthUser",
  "createAuthUser",
  "updateAuthUser",
  "deleteAuthUser",
  "authUserLogin",
  "bulkImportAuthUser",
  "fetchUniqueLocations",
  "verifyUser",
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

describe("authorizedUsersController", () => {
  describe("deleteAllAuthUsers", () => {
    it("delegates to authorizedUsersService.deleteAllAuthUsers and returns its result", async () => {
      authorizedUsersService.deleteAllAuthUsers.mockResolvedValueOnce({
        success: true,
        deleted: 7,
      });
      const { req, res, next } = makeReqRes();

      const out = await authorizedUsersController.deleteAllAuthUsers(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, deleted: 7 });
      expect(
        authorizedUsersService.deleteAllAuthUsers
      ).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.deleteAllAuthUsers).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteAllAuthUsers");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.deleteAllAuthUsers.mockRejectedValueOnce(
        new Error("sftp wipe failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedUsersController.deleteAllAuthUsers(req, res, next)
      ).rejects.toThrow("sftp wipe failed");
    });
  });

  describe("fetchAuthUser", () => {
    it("delegates to authorizedUsersService.fetchAuthUser and returns its result", async () => {
      authorizedUsersService.fetchAuthUser.mockResolvedValueOnce({
        data: [{ _id: "auth_user_1" }, { _id: "auth_user_2" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: 0, limit: 20, verified: "true", search: "alice" };

      const out = await authorizedUsersController.fetchAuthUser(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "auth_user_1" }, { _id: "auth_user_2" }],
        total: 2,
      });
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
        authorizedUsersController.fetchAuthUser(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("createAuthUser", () => {
    it("delegates to authorizedUsersService.createAuthUser and returns its result", async () => {
      authorizedUsersService.createAuthUser.mockResolvedValueOnce({
        success: true,
        id: "auth_user_new",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        firstName: "Alice",
        lastName: "Doe",
        email: "alice@example.com",
        password: "secret",
        roleIds: ["role_viewer"],
      };

      const out = await authorizedUsersController.createAuthUser(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, id: "auth_user_new" });
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
        authorizedUsersController.createAuthUser(req, res, next)
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
      req.body = { firstName: "Alicia" };

      const out = await authorizedUsersController.updateAuthUser(
        req,
        res,
        next
      );

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
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedUsersController.updateAuthUser(req, res, next)
      ).rejects.toThrow("not found");
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

      const out = await authorizedUsersController.deleteAuthUser(
        req,
        res,
        next
      );

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
        new Error("delete failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedUsersController.deleteAuthUser(req, res, next)
      ).rejects.toThrow("delete failed");
    });
  });

  describe("authUserLogin", () => {
    it("delegates to authorizedUsersService.authUserLogin and returns its result", async () => {
      authorizedUsersService.authUserLogin.mockResolvedValueOnce({
        success: true,
        token: "jwt.token.value",
      });
      const { req, res, next } = makeReqRes();
      req.body = { email: "alice@example.com", password: "secret" };

      const out = await authorizedUsersController.authUserLogin(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, token: "jwt.token.value" });
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
        authorizedUsersController.authUserLogin(req, res, next)
      ).rejects.toThrow("invalid credentials");
    });
  });

  describe("bulkImportAuthUser", () => {
    it("delegates to authorizedUsersService.bulkImportAuthUser and returns its result", async () => {
      authorizedUsersService.bulkImportAuthUser.mockResolvedValueOnce({
        success: true,
        inserted: 3,
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        users: [
          { firstName: "A", email: "a@x.com" },
          { firstName: "B", email: "b@x.com" },
          { firstName: "C", email: "c@x.com" },
        ],
      };

      const out = await authorizedUsersController.bulkImportAuthUser(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, inserted: 3 });
      expect(
        authorizedUsersService.bulkImportAuthUser
      ).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.bulkImportAuthUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkImportAuthUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.bulkImportAuthUser.mockRejectedValueOnce(
        new Error("import failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedUsersController.bulkImportAuthUser(req, res, next)
      ).rejects.toThrow("import failed");
    });
  });

  describe("fetchUniqueLocations", () => {
    it("delegates to authorizedUsersService.fetchUniqueLocations and returns its result", async () => {
      authorizedUsersService.fetchUniqueLocations.mockResolvedValueOnce({
        data: ["HQ", "Branch-1", "Branch-2"],
        total: 3,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: 0, limit: 50, search: "branch" };

      const out = await authorizedUsersController.fetchUniqueLocations(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: ["HQ", "Branch-1", "Branch-2"],
        total: 3,
      });
      expect(
        authorizedUsersService.fetchUniqueLocations
      ).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.fetchUniqueLocations).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchUniqueLocations");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.fetchUniqueLocations.mockRejectedValueOnce(
        new Error("aggregate failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedUsersController.fetchUniqueLocations(req, res, next)
      ).rejects.toThrow("aggregate failed");
    });
  });

  describe("verifyUser", () => {
    it("delegates to authorizedUsersService.verifyUser and returns its result", async () => {
      authorizedUsersService.verifyUser.mockResolvedValueOnce({
        success: true,
        verified: true,
      });
      const { req, res, next } = makeReqRes();

      const out = await authorizedUsersController.verifyUser(req, res, next);

      expect(out).toEqual({ success: true, verified: true });
      expect(authorizedUsersService.verifyUser).toHaveBeenCalledTimes(1);
      expect(authorizedUsersService.verifyUser).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("verifyUser");
    });

    it("propagates rejections from the service", async () => {
      authorizedUsersService.verifyUser.mockRejectedValueOnce(
        new Error("face match failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedUsersController.verifyUser(req, res, next)
      ).rejects.toThrow("face match failed");
    });
  });
});
