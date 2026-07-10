/**
 * Unit coverage for core/v1/jobs/jobs.controller.js.
 *
 * The controller is a thin pass-through to JobsService — each handler
 * simply `return JobsService.<method>(req, res, next)`. We mock the
 * service module so that only the controller's own delegation logic
 * gets executed; the service itself is integration-tested elsewhere.
 *
 * Confirms that every controller method:
 *   - forwards the same (req, res, next) it received,
 *   - returns whatever the service returned,
 *   - propagates rejections from the service,
 *   - does not accidentally call sibling service methods.
 *
 * Style mirrors auth.controller.test.js (R27 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: {
    mockCreateJobs: vi.fn(),
    mockDeleteAllJobs: vi.fn(),
  },
}));

import JobsService from "../../../core/v1/jobs/jobs.service.js";
const { default: jobsController } = await import(
  "../../../core/v1/jobs/jobs.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JobsController", () => {
  describe("mockCreateJobs", () => {
    it("delegates to JobsService.mockCreateJobs and returns its result", async () => {
      JobsService.mockCreateJobs.mockResolvedValueOnce({
        created: 5,
        message: "jobs mocked",
      });
      const { req, res, next } = makeReqRes();
      req.body = { count: 5, type: "detection" };

      const out = await jobsController.mockCreateJobs(req, res, next);

      expect(out).toEqual({ created: 5, message: "jobs mocked" });
      expect(JobsService.mockCreateJobs).toHaveBeenCalledTimes(1);
      expect(JobsService.mockCreateJobs).toHaveBeenCalledWith(req, res, next);
      // controller must not touch the sibling service method
      expect(JobsService.mockDeleteAllJobs).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      JobsService.mockCreateJobs.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        jobsController.mockCreateJobs(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("mockDeleteAllJobs", () => {
    it("delegates to JobsService.mockDeleteAllJobs and returns its result", async () => {
      JobsService.mockDeleteAllJobs.mockResolvedValueOnce({
        deleted: 12,
        message: "all jobs deleted",
      });
      const { req, res, next } = makeReqRes();

      const out = await jobsController.mockDeleteAllJobs(req, res, next);

      expect(out).toEqual({ deleted: 12, message: "all jobs deleted" });
      expect(JobsService.mockDeleteAllJobs).toHaveBeenCalledTimes(1);
      expect(JobsService.mockDeleteAllJobs).toHaveBeenCalledWith(req, res, next);
      expect(JobsService.mockCreateJobs).not.toHaveBeenCalled();
    });

    it("propagates rejections from the service", async () => {
      JobsService.mockDeleteAllJobs.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        jobsController.mockDeleteAllJobs(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });
});
