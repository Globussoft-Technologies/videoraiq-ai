import { describe, it, expect } from "vitest";
import AppError from "../../../utils/appError.js";

describe("AppError", () => {
  it("extends Error and preserves message", () => {
    const e = new AppError("nope", 400);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("nope");
  });

  it("status is 'fail' for 4xx codes", () => {
    expect(new AppError("x", 400).status).toBe("fail");
    expect(new AppError("x", 404).status).toBe("fail");
    expect(new AppError("x", 422).status).toBe("fail");
    expect(new AppError("x", 499).status).toBe("fail");
  });

  it("status is 'error' for non-4xx codes", () => {
    expect(new AppError("x", 500).status).toBe("error");
    expect(new AppError("x", 502).status).toBe("error");
    expect(new AppError("x", 301).status).toBe("error");
    expect(new AppError("x", 200).status).toBe("error");
  });

  it("is flagged operational and has a stack trace", () => {
    const e = new AppError("x", 400);
    expect(e.isOperational).toBe(true);
    expect(typeof e.stack).toBe("string");
    expect(e.stack).toContain("appError.test.js");
  });

  it("carries the statusCode through", () => {
    expect(new AppError("x", 418).statusCode).toBe(418);
  });
});
