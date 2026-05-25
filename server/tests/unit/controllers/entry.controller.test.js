/**
 * Unit coverage for core/v1/entry/entry.controller.js.
 *
 * The controller is a thin pass-through to EntryService — every handler is a
 * one-liner `return EntryService.<method>(req, res)`. We mock the service
 * module so only the controller's own delegation logic runs; the service
 * itself (which fans out to Entry/EntryUser/Channels models, the socket
 * dispatcher, JobsService, and MailHelper) is integration-tested elsewhere.
 *
 * Note: unlike most peer controllers, entry.controller methods only forward
 * `(req, res)` — not `next` — so assertions check the two-arg signature.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors shifts.controller.test.js (R41 reference) and
 * domain.controller.test.js (R43 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/entry/entry.service.js", () => ({
  default: {
    register: vi.fn(),
    log: vi.fn(),
    get: vi.fn(),
    getUsers: vi.fn(),
    getUserEntries: vi.fn(),
  },
}));

import EntryService from "../../../core/v1/entry/entry.service.js";
const { default: entryController } = await import(
  "../../../core/v1/entry/entry.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = ["register", "log", "get", "getUsers", "getUserEntries"];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(EntryService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(EntryService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EntryController", () => {
  describe("register", () => {
    it("delegates to EntryService.register and returns its result", async () => {
      EntryService.register.mockResolvedValueOnce({
        status: 201,
        body: { success: true, userId: "user_1" },
      });
      const { req, res } = makeReqRes();
      req.body = {
        firstName: "Alice",
        lastName: "Doe",
        email: "alice@example.com",
        profileImages: ["img1.jpg"],
      };

      const out = await entryController.register(req, res);

      expect(out).toEqual({
        status: 201,
        body: { success: true, userId: "user_1" },
      });
      expect(EntryService.register).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("register");
    });

    it("propagates rejections from the service", async () => {
      EntryService.register.mockRejectedValueOnce(
        new Error("duplicate email")
      );
      const { req, res } = makeReqRes();
      await expect(entryController.register(req, res)).rejects.toThrow(
        "duplicate email"
      );
    });
  });

  describe("log", () => {
    it("delegates to EntryService.log and returns its result", async () => {
      EntryService.log.mockResolvedValueOnce({
        status: 201,
        body: { success: true, message: "Entry logged" },
      });
      const { req, res } = makeReqRes();
      req.body = {
        userId: "user_1",
        channelId: "6881d0279df7d83a343bfa72",
        action: "checkin",
      };

      const out = await entryController.log(req, res);

      expect(out).toEqual({
        status: 201,
        body: { success: true, message: "Entry logged" },
      });
      expect(EntryService.log).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("log");
    });

    it("propagates rejections from the service", async () => {
      EntryService.log.mockRejectedValueOnce(new Error("channel not found"));
      const { req, res } = makeReqRes();
      await expect(entryController.log(req, res)).rejects.toThrow(
        "channel not found"
      );
    });
  });

  describe("get", () => {
    it("delegates to EntryService.get and returns its result", async () => {
      EntryService.get.mockResolvedValueOnce({
        data: [
          { _id: "entry_1", userId: "user_1", action: "checkin" },
        ],
        total: 1,
      });
      const { req, res } = makeReqRes();
      req.query = {
        skip: "0",
        limit: "10",
        name: "Alice",
        channelId: "6881d0279df7d83a343bfa72",
        startDate: "2025-10-03",
        endDate: "2025-10-03",
        sortField: "fullname",
        sortOrder: "asc",
      };

      const out = await entryController.get(req, res);

      expect(out).toEqual({
        data: [{ _id: "entry_1", userId: "user_1", action: "checkin" }],
        total: 1,
      });
      expect(EntryService.get).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("get");
    });

    it("propagates rejections from the service", async () => {
      EntryService.get.mockRejectedValueOnce(new Error("db unreachable"));
      const { req, res } = makeReqRes();
      await expect(entryController.get(req, res)).rejects.toThrow(
        "db unreachable"
      );
    });
  });

  describe("getUsers", () => {
    it("delegates to EntryService.getUsers and returns its result", async () => {
      EntryService.getUsers.mockResolvedValueOnce({
        data: [
          { _id: "user_1", firstName: "Alice", email: "alice@example.com" },
        ],
      });
      const { req, res } = makeReqRes();
      req.query = { search: "Alice" };

      const out = await entryController.getUsers(req, res);

      expect(out).toEqual({
        data: [
          { _id: "user_1", firstName: "Alice", email: "alice@example.com" },
        ],
      });
      expect(EntryService.getUsers).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("getUsers");
    });

    it("propagates rejections from the service", async () => {
      EntryService.getUsers.mockRejectedValueOnce(new Error("query failed"));
      const { req, res } = makeReqRes();
      await expect(entryController.getUsers(req, res)).rejects.toThrow(
        "query failed"
      );
    });
  });

  describe("getUserEntries", () => {
    it("delegates to EntryService.getUserEntries and returns its result", async () => {
      EntryService.getUserEntries.mockResolvedValueOnce({
        data: [{ _id: "entry_1", userId: "user_1", action: "checkin" }],
      });
      const { req, res } = makeReqRes();
      req.params = { userId: "user_1" };
      req.query = { startDate: "2025-10-01", endDate: "2025-10-31" };

      const out = await entryController.getUserEntries(req, res);

      expect(out).toEqual({
        data: [{ _id: "entry_1", userId: "user_1", action: "checkin" }],
      });
      expect(EntryService.getUserEntries).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("getUserEntries");
    });

    it("propagates rejections from the service", async () => {
      EntryService.getUserEntries.mockRejectedValueOnce(
        new Error("user not found")
      );
      const { req, res } = makeReqRes();
      await expect(
        entryController.getUserEntries(req, res)
      ).rejects.toThrow("user not found");
    });
  });
});
