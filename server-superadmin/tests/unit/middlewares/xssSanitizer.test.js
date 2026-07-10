import { describe, it, expect } from "vitest";
import sanitizeInput from "../../../middlewares/xssSanitizer.js";
import { makeReqRes } from "../../helpers/factory.js";

describe("xssSanitizer middleware", () => {
  it("strips script tags from body string values", () => {
    const { req, res, next } = makeReqRes();
    req.body = { comment: "<script>alert(1)</script>hello" };
    sanitizeInput(req, res, next);
    expect(req.body.comment).not.toContain("<script>");
    expect(req.body.comment).toContain("hello");
    expect(next.calls).toHaveLength(1);
  });

  it("sanitizes nested object values recursively", () => {
    const { req, res, next } = makeReqRes();
    req.body = { user: { bio: "<img src=x onerror=alert(1)>" } };
    sanitizeInput(req, res, next);
    expect(req.body.user.bio).not.toContain("onerror=alert");
  });

  it("sanitizes query and params too", () => {
    const { req, res, next } = makeReqRes();
    req.query = { q: "<script>x</script>" };
    req.params = { id: "<b>123</b>" };
    sanitizeInput(req, res, next);
    expect(req.query.q).not.toContain("<script>");
    // xss() escapes / filters tags rather than throwing.
    expect(typeof req.params.id).toBe("string");
  });

  it("leaves non-string values untouched", () => {
    const { req, res, next } = makeReqRes();
    req.body = { count: 42, active: true, ratio: 1.5 };
    sanitizeInput(req, res, next);
    expect(req.body).toEqual({ count: 42, active: true, ratio: 1.5 });
  });

  it("leaves clean strings unchanged", () => {
    const { req, res, next } = makeReqRes();
    req.body = { name: "Jane Doe" };
    sanitizeInput(req, res, next);
    expect(req.body.name).toBe("Jane Doe");
  });

  it("always calls next()", () => {
    const { req, res, next } = makeReqRes();
    sanitizeInput(req, res, next);
    expect(next.calls).toHaveLength(1);
  });

  it("handles arrays of values inside the body", () => {
    const { req, res, next } = makeReqRes();
    req.body = { tags: ["<script>a</script>", "clean"] };
    sanitizeInput(req, res, next);
    expect(req.body.tags[0]).not.toContain("<script>");
    expect(req.body.tags[1]).toBe("clean");
  });
});
