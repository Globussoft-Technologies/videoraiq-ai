/**
 * Unit coverage for core/v1/admin/admin.controller.js.
 *
 * The controller is a thin pass-through to AdminService — every handler is a
 * one-liner `return await adminService.<method>(req, res, next)`. We mock the
 * service module so only the controller's own delegation logic runs; the
 * service itself (which fans out across User/Admin models, EMP import, mailer,
 * etc.) is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors entry.controller.test.js (R45 reference) and
 * domain.controller.test.js (R43 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/admin/admin.service.js", () => ({
  default: {
    signUP: vi.fn(),
    updateAdmin: vi.fn(),
    fetch: vi.fn(),
    getEmpEmployees: vi.fn(),
    importEMPUsers: vi.fn(),
    addEMPEmails: vi.fn(),
    getEMPEmails: vi.fn(),
    updateEMPEmail: vi.fn(),
    deleteEMPEmail: vi.fn(),
    getLocationByEmpEmail: vi.fn(),
    getDeletionProgress: vi.fn(),
    updateLogsSound: vi.fn(),
    fetchLogsSound: vi.fn(),
  },
}));

import AdminService from "../../../core/v1/admin/admin.service.js";
const { default: adminController } = await import(
  "../../../core/v1/admin/admin.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "signUP",
  "updateAdmin",
  "fetch",
  "getEmpEmployees",
  "importEMPUsers",
  "addEMPEmails",
  "getEMPEmails",
  "updateEMPEmail",
  "deleteEMPEmail",
  "getLocationByEmpEmail",
  "getDeletionProgress",
  "updateLogsSound",
  "fetchLogsSound",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(AdminService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(AdminService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminController", () => {
  describe("signUP", () => {
    it("delegates to AdminService.signUP and returns its result", async () => {
      AdminService.signUP.mockResolvedValueOnce({
        status: 201,
        body: { success: true, adminId: "admin_1" },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        email: "admin@example.com",
        password: "Secret123!",
        firstName: "Root",
        lastName: "Admin",
      };

      const out = await adminController.signUP(req, res, next);

      expect(out).toEqual({
        status: 201,
        body: { success: true, adminId: "admin_1" },
      });
      expect(AdminService.signUP).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("signUP");
    });

    it("propagates rejections from the service", async () => {
      AdminService.signUP.mockRejectedValueOnce(new Error("duplicate email"));
      const { req, res, next } = makeReqRes();
      await expect(adminController.signUP(req, res, next)).rejects.toThrow(
        "duplicate email"
      );
    });
  });

  describe("updateAdmin", () => {
    it("delegates to AdminService.updateAdmin and returns its result", async () => {
      AdminService.updateAdmin.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "Admin updated" },
      });
      const { req, res, next } = makeReqRes();
      req.body = { firstName: "Updated", lastName: "Name" };

      const out = await adminController.updateAdmin(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "Admin updated" },
      });
      expect(AdminService.updateAdmin).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateAdmin");
    });

    it("propagates rejections from the service", async () => {
      AdminService.updateAdmin.mockRejectedValueOnce(new Error("admin not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.updateAdmin(req, res, next)
      ).rejects.toThrow("admin not found");
    });
  });

  describe("fetch", () => {
    it("delegates to AdminService.fetch and returns its result", async () => {
      AdminService.fetch.mockResolvedValueOnce({
        status: 200,
        body: { success: true, data: { _id: "admin_1", email: "a@b.c" } },
      });
      const { req, res, next } = makeReqRes();

      const out = await adminController.fetch(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, data: { _id: "admin_1", email: "a@b.c" } },
      });
      expect(AdminService.fetch).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("fetch");
    });

    it("propagates rejections from the service", async () => {
      AdminService.fetch.mockRejectedValueOnce(new Error("db unreachable"));
      const { req, res, next } = makeReqRes();
      await expect(adminController.fetch(req, res, next)).rejects.toThrow(
        "db unreachable"
      );
    });
  });

  describe("getEmpEmployees", () => {
    it("delegates to AdminService.getEmpEmployees and returns its result", async () => {
      AdminService.getEmpEmployees.mockResolvedValueOnce({
        data: [{ email: "emp1@example.com" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10" };

      const out = await adminController.getEmpEmployees(req, res, next);

      expect(out).toEqual({
        data: [{ email: "emp1@example.com" }],
        total: 1,
      });
      expect(AdminService.getEmpEmployees).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getEmpEmployees");
    });

    it("propagates rejections from the service", async () => {
      AdminService.getEmpEmployees.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.getEmpEmployees(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("importEMPUsers", () => {
    it("delegates to AdminService.importEMPUsers and returns its result", async () => {
      AdminService.importEMPUsers.mockResolvedValueOnce({
        status: 200,
        body: { success: true, imported: 5 },
      });
      const { req, res, next } = makeReqRes();
      req.body = { emails: ["a@x.com", "b@x.com"] };

      const out = await adminController.importEMPUsers(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, imported: 5 },
      });
      expect(AdminService.importEMPUsers).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("importEMPUsers");
    });

    it("propagates rejections from the service", async () => {
      AdminService.importEMPUsers.mockRejectedValueOnce(
        new Error("emp service down")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.importEMPUsers(req, res, next)
      ).rejects.toThrow("emp service down");
    });
  });

  describe("addEMPEmails", () => {
    it("delegates to AdminService.addEMPEmails and returns its result", async () => {
      AdminService.addEMPEmails.mockResolvedValueOnce({
        status: 200,
        body: { success: true, added: 2 },
      });
      const { req, res, next } = makeReqRes();
      req.body = { emails: ["new1@x.com", "new2@x.com"] };

      const out = await adminController.addEMPEmails(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, added: 2 },
      });
      expect(AdminService.addEMPEmails).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("addEMPEmails");
    });

    it("propagates rejections from the service", async () => {
      AdminService.addEMPEmails.mockRejectedValueOnce(
        new Error("duplicate emp email")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.addEMPEmails(req, res, next)
      ).rejects.toThrow("duplicate emp email");
    });
  });

  describe("getEMPEmails", () => {
    it("delegates to AdminService.getEMPEmails and returns its result", async () => {
      AdminService.getEMPEmails.mockResolvedValueOnce({
        status: 200,
        body: { success: true, data: ["a@x.com", "b@x.com"] },
      });
      const { req, res, next } = makeReqRes();

      const out = await adminController.getEMPEmails(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, data: ["a@x.com", "b@x.com"] },
      });
      expect(AdminService.getEMPEmails).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getEMPEmails");
    });

    it("propagates rejections from the service", async () => {
      AdminService.getEMPEmails.mockRejectedValueOnce(
        new Error("admin record missing")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.getEMPEmails(req, res, next)
      ).rejects.toThrow("admin record missing");
    });
  });

  describe("updateEMPEmail", () => {
    it("delegates to AdminService.updateEMPEmail and returns its result", async () => {
      AdminService.updateEMPEmail.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "Email updated" },
      });
      const { req, res, next } = makeReqRes();
      req.body = { oldEmail: "old@x.com", newEmail: "new@x.com" };

      const out = await adminController.updateEMPEmail(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "Email updated" },
      });
      expect(AdminService.updateEMPEmail).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateEMPEmail");
    });

    it("propagates rejections from the service", async () => {
      AdminService.updateEMPEmail.mockRejectedValueOnce(
        new Error("old email not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.updateEMPEmail(req, res, next)
      ).rejects.toThrow("old email not found");
    });
  });

  describe("deleteEMPEmail", () => {
    it("delegates to AdminService.deleteEMPEmail and returns its result", async () => {
      AdminService.deleteEMPEmail.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "Email deleted" },
      });
      const { req, res, next } = makeReqRes();
      req.body = { email: "gone@x.com" };

      const out = await adminController.deleteEMPEmail(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "Email deleted" },
      });
      expect(AdminService.deleteEMPEmail).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteEMPEmail");
    });

    it("propagates rejections from the service", async () => {
      AdminService.deleteEMPEmail.mockRejectedValueOnce(
        new Error("email not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.deleteEMPEmail(req, res, next)
      ).rejects.toThrow("email not found");
    });
  });

  describe("getLocationByEmpEmail", () => {
    it("delegates to AdminService.getLocationByEmpEmail and returns its result", async () => {
      AdminService.getLocationByEmpEmail.mockResolvedValueOnce({
        status: 200,
        body: { success: true, location: "HQ" },
      });
      const { req, res, next } = makeReqRes();
      req.query = { email: "emp@x.com" };

      const out = await adminController.getLocationByEmpEmail(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, location: "HQ" },
      });
      expect(AdminService.getLocationByEmpEmail).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getLocationByEmpEmail");
    });

    it("propagates rejections from the service", async () => {
      AdminService.getLocationByEmpEmail.mockRejectedValueOnce(
        new Error("location lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.getLocationByEmpEmail(req, res, next)
      ).rejects.toThrow("location lookup failed");
    });
  });

  describe("getDeletionProgress", () => {
    it("delegates to AdminService.getDeletionProgress and returns its result", async () => {
      AdminService.getDeletionProgress.mockResolvedValueOnce({
        status: 200,
        body: { success: true, progress: 42 },
      });
      const { req, res, next } = makeReqRes();
      req.query = { email: "emp@x.com" };

      const out = await adminController.getDeletionProgress(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, progress: 42 },
      });
      expect(AdminService.getDeletionProgress).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getDeletionProgress");
    });

    it("propagates rejections from the service", async () => {
      AdminService.getDeletionProgress.mockRejectedValueOnce(
        new Error("progress unavailable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.getDeletionProgress(req, res, next)
      ).rejects.toThrow("progress unavailable");
    });
  });

  describe("updateLogsSound", () => {
    it("delegates to AdminService.updateLogsSound and returns its result", async () => {
      AdminService.updateLogsSound.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "logsSound updated" },
      });
      const { req, res, next } = makeReqRes();
      req.body = { logsSound: true };

      const out = await adminController.updateLogsSound(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "logsSound updated" },
      });
      expect(AdminService.updateLogsSound).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateLogsSound");
    });

    it("propagates rejections from the service", async () => {
      AdminService.updateLogsSound.mockRejectedValueOnce(
        new Error("update failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.updateLogsSound(req, res, next)
      ).rejects.toThrow("update failed");
    });
  });

  describe("fetchLogsSound", () => {
    it("delegates to AdminService.fetchLogsSound and returns its result", async () => {
      AdminService.fetchLogsSound.mockResolvedValueOnce({
        status: 200,
        body: { success: true, logsSound: false },
      });
      const { req, res, next } = makeReqRes();

      const out = await adminController.fetchLogsSound(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, logsSound: false },
      });
      expect(AdminService.fetchLogsSound).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("fetchLogsSound");
    });

    it("propagates rejections from the service", async () => {
      AdminService.fetchLogsSound.mockRejectedValueOnce(
        new Error("fetch failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        adminController.fetchLogsSound(req, res, next)
      ).rejects.toThrow("fetch failed");
    });
  });
});
