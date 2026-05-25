/**
 * Unit coverage for core/v1/departments/departments.controller.js.
 *
 * The controller is a thin pass-through to departmentsServices — each handler
 * simply `return departmentsServices.<method>(req, res, next)`. We mock the
 * service module so only the controller's own delegation logic gets executed;
 * the service is integration-tested elsewhere.
 *
 * Confirms that every controller method:
 *   - forwards the same (req, res, next) it received,
 *   - returns whatever the service returned,
 *   - propagates rejections from the service,
 *   - does not accidentally call sibling service methods.
 *
 * Style mirrors jobs.controller.test.js (R28 reference) and
 * auth.controller.test.js (R27 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/departments/departments.service.js", () => ({
  default: {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import departmentsServices from "../../../core/v1/departments/departments.service.js";
const { default: departmentController } = await import(
  "../../../core/v1/departments/departments.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DepartmentController", () => {
  describe("create", () => {
    it("delegates to departmentsServices.create and returns its result", async () => {
      departmentsServices.create.mockResolvedValueOnce({
        _id: "dep_1",
        departmentName: "engineering",
      });
      const { req, res, next } = makeReqRes();
      req.body = { departmentName: "Engineering", empDepartmentId: "E1" };

      const out = await departmentController.create(req, res, next);

      expect(out).toEqual({ _id: "dep_1", departmentName: "engineering" });
      expect(departmentsServices.create).toHaveBeenCalledTimes(1);
      expect(departmentsServices.create).toHaveBeenCalledWith(req, res, next);
      // sibling methods must not be invoked
      expect(departmentsServices.get).not.toHaveBeenCalled();
      expect(departmentsServices.update).not.toHaveBeenCalled();
      expect(departmentsServices.delete).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      departmentsServices.create.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        departmentController.create(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("get", () => {
    it("delegates to departmentsServices.get and returns its result", async () => {
      departmentsServices.get.mockResolvedValueOnce({
        data: [{ _id: "dep_1", departmentName: "engineering" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { page: "1", limit: "20" };

      const out = await departmentController.get(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "dep_1", departmentName: "engineering" }],
        total: 1,
      });
      expect(departmentsServices.get).toHaveBeenCalledTimes(1);
      expect(departmentsServices.get).toHaveBeenCalledWith(req, res, next);
      expect(departmentsServices.create).not.toHaveBeenCalled();
      expect(departmentsServices.update).not.toHaveBeenCalled();
      expect(departmentsServices.delete).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      departmentsServices.get.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        departmentController.get(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("update", () => {
    it("delegates to departmentsServices.update and returns its result", async () => {
      departmentsServices.update.mockResolvedValueOnce({
        _id: "dep_1",
        departmentName: "operations",
      });
      const { req, res, next } = makeReqRes();
      req.query = { departmentId: "dep_1" };
      req.body = { departmentName: "Operations" };

      const out = await departmentController.update(req, res, next);

      expect(out).toEqual({ _id: "dep_1", departmentName: "operations" });
      expect(departmentsServices.update).toHaveBeenCalledTimes(1);
      expect(departmentsServices.update).toHaveBeenCalledWith(req, res, next);
      expect(departmentsServices.create).not.toHaveBeenCalled();
      expect(departmentsServices.get).not.toHaveBeenCalled();
      expect(departmentsServices.delete).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      departmentsServices.update.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        departmentController.update(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("delete", () => {
    it("delegates to departmentsServices.delete and returns its result", async () => {
      departmentsServices.delete.mockResolvedValueOnce({
        deleted: 1,
        message: "department deleted",
      });
      const { req, res, next } = makeReqRes();
      req.query = { departmentId: "dep_1" };

      const out = await departmentController.delete(req, res, next);

      expect(out).toEqual({ deleted: 1, message: "department deleted" });
      expect(departmentsServices.delete).toHaveBeenCalledTimes(1);
      expect(departmentsServices.delete).toHaveBeenCalledWith(req, res, next);
      expect(departmentsServices.create).not.toHaveBeenCalled();
      expect(departmentsServices.get).not.toHaveBeenCalled();
      expect(departmentsServices.update).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      departmentsServices.delete.mockRejectedValueOnce(
        new Error("permission denied")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        departmentController.delete(req, res, next)
      ).rejects.toThrow("permission denied");
    });
  });
});
