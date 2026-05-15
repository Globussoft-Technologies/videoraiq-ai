import { describe, it, expect, beforeEach, afterEach } from "vitest";
import globalErrorHandler from "../../../middlewares/errorMiddleware.js";
import AppError from "../../../utils/appError.js";
import { makeReqRes } from "../../helpers/factory.js";

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("globalErrorHandler", () => {
  describe("development output", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("sends statusCode, message, and stack for an AppError", () => {
      const { req, res, next } = makeReqRes();
      const err = new AppError("bad thing", 400);
      globalErrorHandler(err, req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res._body.status).toBe("fail");
      expect(res._body.message).toBe("bad thing");
      expect(res._body.stack).toBeDefined();
      expect(res._body.error).toBeDefined();
    });

    it("defaults to 500 when the error has no statusCode", () => {
      const { req, res, next } = makeReqRes();
      globalErrorHandler(new Error("plain"), req, res, next);
      expect(res.statusCode).toBe(500);
      expect(res._body.status).toBe("error");
    });
  });

  describe("production output", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("sends a clean message for an operational AppError", () => {
      const { req, res, next } = makeReqRes();
      globalErrorHandler(new AppError("not found", 404), req, res, next);
      expect(res.statusCode).toBe(404);
      expect(res._body).toEqual({ status: "fail", message: "not found" });
      expect(res._body.stack).toBeUndefined();
    });

    it("hides details for a non-operational (programming) error", () => {
      const { req, res, next } = makeReqRes();
      const err = new Error("internal detail leak");
      globalErrorHandler(err, req, res, next);
      expect(res.statusCode).toBe(500);
      expect(res._body.message).toBe("Something went very wrong!");
      expect(res._body.message).not.toContain("internal detail leak");
    });

    it("maps a Mongoose CastError to a 400", () => {
      const { req, res, next } = makeReqRes();
      const err = new Error("cast failed");
      err.name = "CastError";
      err.path = "id";
      err.value = "xyz";
      globalErrorHandler(err, req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res._body.message).toMatch(/Invalid id/);
    });

    it("maps a JWT error to a 401", () => {
      const { req, res, next } = makeReqRes();
      const err = new Error("jwt malformed");
      err.name = "JsonWebTokenError";
      globalErrorHandler(err, req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res._body.message).toMatch(/log in again/i);
    });

    it("maps an expired-token error to a 401", () => {
      const { req, res, next } = makeReqRes();
      const err = new Error("jwt expired");
      err.name = "TokenExpiredError";
      globalErrorHandler(err, req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res._body.message).toMatch(/expired/i);
    });

    it("maps a duplicate-key (11000) error to a 400", () => {
      const { req, res, next } = makeReqRes();
      const err = new Error("dup");
      err.code = 11000;
      err.errmsg = 'E11000 duplicate key error: { "email" }';
      globalErrorHandler(err, req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res._body.message).toMatch(/Duplicate field/);
    });
  });
});
