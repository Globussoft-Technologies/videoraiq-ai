import { describe, it, expect } from "vitest";
import Response from "../../../utils/response.js";

describe("Response", () => {
  describe("success shapes", () => {
    it("userSuccessResp wraps message + data with 200", () => {
      const r = Response.userSuccessResp("done", { id: 1 });
      expect(r.statusCode).toBe(200);
      expect(r.body).toEqual({
        status: "success",
        message: "done",
        data: { id: 1 },
      });
    });

    it("SuccessResp matches userSuccessResp shape", () => {
      const a = Response.userSuccessResp("m", "d");
      const b = Response.SuccessResp("m", "d");
      expect(a).toEqual(b);
    });
  });

  describe("failure shapes", () => {
    it("userFailResp returns 400 with status 'failed'", () => {
      const r = Response.userFailResp("bad input", "field");
      expect(r.statusCode).toBe(400);
      expect(r.body.status).toBe("failed");
      expect(r.body.message).toBe("bad input");
      expect(r.body.error).toBe("field");
    });

    it("FailResp is the user-facing alias", () => {
      expect(Response.FailResp("m", "e")).toEqual(
        Response.userFailResp("m", "e")
      );
    });

    it("tokenFailResp returns 400", () => {
      expect(Response.tokenFailResp("m", "e").statusCode).toBe(400);
    });

    it("validationFailResp returns 400", () => {
      expect(Response.validationFailResp("m", "e").statusCode).toBe(400);
    });
  });

  describe("error shapes", () => {
    it("errorResp returns 500", () => {
      const r = Response.errorResp("crash", new Error("boom"));
      expect(r.statusCode).toBe(500);
      expect(r.body.status).toBe("failed");
    });

    it("notFoundResp currently returns 500 (matches source)", () => {
      // Note: source returns 500, not 404 — this test pins the current behavior.
      // Update if the source is fixed to return 404.
      expect(Response.notFoundResp("nope", null).statusCode).toBe(500);
    });
  });

  describe("special shapes", () => {
    it("accessDeniedResp returns 403", () => {
      const r = Response.accessDeniedResp("forbidden", "no perm");
      expect(r.statusCode).toBe(403);
      expect(r.body).toMatchObject({ status: "failed", message: "forbidden" });
    });

    it("planExpiredResp returns custom 812 status", () => {
      const r = Response.planExpiredResp("expired", null);
      expect(r.statusCode).toBe(812);
      expect(r.body.status).toBe("failed");
    });
  });
});
