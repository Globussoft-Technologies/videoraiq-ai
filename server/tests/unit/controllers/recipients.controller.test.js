/**
 * Unit coverage for core/v1/verifyRecipients/recipients.controller.js.
 *
 * Every handler is a thin pass-through to recipientsService — each method is
 * a one-liner `return await recipientsService.<method>(req, res, next)`. We
 * mock the service so we exercise only the controller's own delegation
 * wiring and catch any swapped method names.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors accesslogs.controller.test.js (R34), vehicle (R37),
 * locations (R36).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/verifyRecipients/recipients.service.js", () => ({
  default: {
    createRecipients: vi.fn(),
    verify: vi.fn(),
    resendMailOrSMS: vi.fn(),
    fetchRecipients: vi.fn(),
    deleteRecipients: vi.fn(),
    updateRecipient: vi.fn(),
  },
}));

import recipientsService from "../../../core/v1/verifyRecipients/recipients.service.js";
const { default: recipientsController } = await import(
  "../../../core/v1/verifyRecipients/recipients.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "createRecipients",
  "verify",
  "resendMailOrSMS",
  "fetchRecipients",
  "deleteRecipients",
  "updateRecipient",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(recipientsService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recipientsController", () => {
  describe("createRecipients", () => {
    it("delegates to recipientsService.createRecipients and returns its result", async () => {
      recipientsService.createRecipients.mockResolvedValueOnce({
        success: true,
        recipientId: "rec_1",
      });
      const { req, res, next } = makeReqRes();
      req.query = { alertType: "email" };
      req.body = { value: "alerts@test.com", fullName: "Alerts Inbox" };

      const out = await recipientsController.createRecipients(req, res, next);

      expect(out).toEqual({ success: true, recipientId: "rec_1" });
      expect(recipientsService.createRecipients).toHaveBeenCalledTimes(1);
      expect(recipientsService.createRecipients).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createRecipients");
    });

    it("propagates rejections from the service", async () => {
      recipientsService.createRecipients.mockRejectedValueOnce(
        new Error("duplicate recipient")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        recipientsController.createRecipients(req, res, next)
      ).rejects.toThrow("duplicate recipient");
    });
  });

  describe("verify", () => {
    it("delegates to recipientsService.verify and returns its result", async () => {
      recipientsService.verify.mockResolvedValueOnce({
        success: true,
        verified: true,
      });
      const { req, res, next } = makeReqRes();
      req.query = { alertType: "email", otp: "123456" };
      req.body = { value: "alerts@test.com" };

      const out = await recipientsController.verify(req, res, next);

      expect(out).toEqual({ success: true, verified: true });
      expect(recipientsService.verify).toHaveBeenCalledTimes(1);
      expect(recipientsService.verify).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("verify");
    });

    it("propagates rejections from the service", async () => {
      recipientsService.verify.mockRejectedValueOnce(new Error("invalid otp"));
      const { req, res, next } = makeReqRes();
      await expect(
        recipientsController.verify(req, res, next)
      ).rejects.toThrow("invalid otp");
    });
  });

  describe("resendMailOrSMS", () => {
    it("delegates to recipientsService.resendMailOrSMS and returns its result", async () => {
      recipientsService.resendMailOrSMS.mockResolvedValueOnce({
        success: true,
        resent: true,
      });
      const { req, res, next } = makeReqRes();
      req.query = { alertType: "phoneNumber", id: "rec_1" };
      req.body = { value: "+911234567890" };

      const out = await recipientsController.resendMailOrSMS(req, res, next);

      expect(out).toEqual({ success: true, resent: true });
      expect(recipientsService.resendMailOrSMS).toHaveBeenCalledTimes(1);
      expect(recipientsService.resendMailOrSMS).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("resendMailOrSMS");
    });

    it("propagates rejections from the service", async () => {
      recipientsService.resendMailOrSMS.mockRejectedValueOnce(
        new Error("sms gateway down")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        recipientsController.resendMailOrSMS(req, res, next)
      ).rejects.toThrow("sms gateway down");
    });
  });

  describe("fetchRecipients", () => {
    it("delegates to recipientsService.fetchRecipients and returns its result", async () => {
      recipientsService.fetchRecipients.mockResolvedValueOnce({
        data: [
          { _id: "rec_1", value: "alerts@test.com", isVerified: true },
          { _id: "rec_2", value: "ops@test.com", isVerified: false },
        ],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        alertType: "email",
        skip: "0",
        limit: "10",
        orderBy: "createdAt",
        sort: "desc",
        filterByStatus: "All",
        search: "",
      };

      const out = await recipientsController.fetchRecipients(req, res, next);

      expect(out).toEqual({
        data: [
          { _id: "rec_1", value: "alerts@test.com", isVerified: true },
          { _id: "rec_2", value: "ops@test.com", isVerified: false },
        ],
        total: 2,
      });
      expect(recipientsService.fetchRecipients).toHaveBeenCalledTimes(1);
      expect(recipientsService.fetchRecipients).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchRecipients");
    });

    it("propagates rejections from the service", async () => {
      recipientsService.fetchRecipients.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        recipientsController.fetchRecipients(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("deleteRecipients", () => {
    it("delegates to recipientsService.deleteRecipients and returns its result", async () => {
      recipientsService.deleteRecipients.mockResolvedValueOnce({
        success: true,
        deletedCount: 2,
      });
      const { req, res, next } = makeReqRes();
      req.body = { ids: ["rec_1", "rec_2"] };

      const out = await recipientsController.deleteRecipients(req, res, next);

      expect(out).toEqual({ success: true, deletedCount: 2 });
      expect(recipientsService.deleteRecipients).toHaveBeenCalledTimes(1);
      expect(recipientsService.deleteRecipients).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteRecipients");
    });

    it("propagates rejections from the service", async () => {
      recipientsService.deleteRecipients.mockRejectedValueOnce(
        new Error("recipient not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        recipientsController.deleteRecipients(req, res, next)
      ).rejects.toThrow("recipient not found");
    });
  });

  describe("updateRecipient", () => {
    it("delegates to recipientsService.updateRecipient and returns its result", async () => {
      recipientsService.updateRecipient.mockResolvedValueOnce({
        success: true,
        updated: { _id: "rec_1", fullName: "Renamed Inbox" },
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "rec_1" };
      req.body = {
        fullName: "Renamed Inbox",
        incidentTypes: ["intrusion", "loitering"],
      };

      const out = await recipientsController.updateRecipient(req, res, next);

      expect(out).toEqual({
        success: true,
        updated: { _id: "rec_1", fullName: "Renamed Inbox" },
      });
      expect(recipientsService.updateRecipient).toHaveBeenCalledTimes(1);
      expect(recipientsService.updateRecipient).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateRecipient");
    });

    it("propagates rejections from the service", async () => {
      recipientsService.updateRecipient.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        recipientsController.updateRecipient(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });
});
