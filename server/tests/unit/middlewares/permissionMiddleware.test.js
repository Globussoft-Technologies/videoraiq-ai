import { describe, it, expect, beforeEach } from "vitest";
import {
  viewAccessCheck,
  createAccessCheck,
  editAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";
import { makeReqRes, completePermissionConfig } from "../../helpers/factory.js";

function setupReq(opts = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    state: true,
    userData: opts.userData ?? { memberId: "user_123" },
    permissionConfig: opts.permissionConfig ?? [
      { permissionConfig: completePermissionConfig() },
    ],
  };
  req.mainRoute = opts.mainRoute ?? "/api/v1/incidents";
  return { req, res, next };
}

describe("permissionMiddleware", () => {
  describe("viewAccessCheck", () => {
    it("calls next() when no member-scoped check is configured (admin path)", async () => {
      const { req, res, next } = setupReq({ userData: { adminId: "a1" } });
      await viewAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(1);
    });

    it("calls next() even when missing permissionConfig — current behavior", async () => {
      // The view check is currently a pass-through (the gated logic is
      // commented out in source). Pin that behavior so a future re-enable is
      // a visible diff.
      const { req, res, next } = setupReq({ permissionConfig: undefined });
      await viewAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(1);
    });
  });

  describe("createAccessCheck", () => {
    it("allows when the matching module has create:true", async () => {
      const { req, res, next } = setupReq({
        userData: { memberId: "u1" },
        mainRoute: "/api/v1/incidents",
        permissionConfig: [{ permissionConfig: completePermissionConfig() }],
      });
      await createAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(1);
    });

    it("denies when the matching module has create:false", async () => {
      const { req, res, next } = setupReq({
        userData: { memberId: "u1" },
        mainRoute: "/api/v1/incidents",
        permissionConfig: [
          {
            permissionConfig: {
              ...completePermissionConfig(),
              incidents: { view: true, create: false, edit: true, delete: true },
            },
          },
        ],
      });
      await createAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(0);
      expect(res.statusCode).toBe(400);
      expect(res._body?.body?.status).toBe("failed");
    });

    it("bypasses the permission check when userData has no memberId", async () => {
      // Top-level admin (no memberId) skips the per-module check.
      const { req, res, next } = setupReq({
        userData: { adminId: "a1" },
        permissionConfig: [{ permissionConfig: { incidents: { create: false } } }],
      });
      await createAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(1);
    });
  });

  describe("editAccessCheck", () => {
    it("denies on edit:false", async () => {
      const { req, res, next } = setupReq({
        userData: { memberId: "u1" },
        mainRoute: "/api/v1/nvr",
        permissionConfig: [
          {
            permissionConfig: {
              ...completePermissionConfig(),
              NVR: { view: true, create: true, edit: false, delete: true },
            },
          },
        ],
      });
      await editAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(0);
      expect(res.statusCode).toBe(400);
    });

    it("allows on edit:true", async () => {
      const { req, res, next } = setupReq({
        userData: { memberId: "u1" },
        mainRoute: "/api/v1/nvr",
      });
      await editAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(1);
    });
  });

  describe("deleteAccessCheck", () => {
    it("denies on delete:false", async () => {
      const { req, res, next } = setupReq({
        userData: { memberId: "u1" },
        mainRoute: "/api/v1/users",
        permissionConfig: [
          {
            permissionConfig: {
              ...completePermissionConfig(),
              Users: { view: true, create: true, edit: true, delete: false },
            },
          },
        ],
      });
      await deleteAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(0);
      expect(res.statusCode).toBe(400);
    });

    it("allows on delete:true", async () => {
      const { req, res, next } = setupReq({
        userData: { memberId: "u1" },
        mainRoute: "/api/v1/users",
      });
      await deleteAccessCheck(req, res, next);
      expect(next.calls).toHaveLength(1);
    });
  });
});
