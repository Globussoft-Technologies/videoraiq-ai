/**
 * src/page/user/Settings/Api/post/index.jsx — verifyOtp, createAlert, resendMailOrSMS.
 * All call global fetch; createAlert + resendMailOrSMS use waitForToken.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const waitForTokenMock = vi.hoisted(() => vi.fn(async () => "TOK_POST"));
vi.mock("@/utils/waitForToken", () => ({ waitForToken: waitForTokenMock }));

const tokenMock = vi.hoisted(() => vi.fn(() => "UNUSED"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { verifyOtp, createAlert, resendMailOrSMS } = await import(
  "../../../../../../src/page/user/Settings/Api/post/index.jsx"
);

const origFetch = globalThis.fetch;

beforeEach(() => {
  waitForTokenMock.mockClear();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("page/Settings verifyOtp", () => {
  it("POSTs to /api/v1/recipients/verify with alertType and otp in the URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: "ok" }),
    });
    const r = await verifyOtp({
      type: "email",
      value: "a@b.com",
      tokenData: "999",
    });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/v1/recipients/verify");
    expect(url).toContain("alertType=email");
    expect(url).toContain("otp=999");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ email: "a@b.com" });
    expect(r).toEqual({ status: "ok" });
  });

  it("does not call waitForToken (the line is commented in source)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({}),
    });
    await verifyOtp({ type: "sms", value: "555", tokenData: "1" });
    expect(waitForTokenMock).not.toHaveBeenCalled();
  });

  it("returns undefined when fetch rejects (catches)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("oops"));
    const r = await verifyOtp({ type: "email", value: "a", tokenData: "b" });
    expect(r).toBeUndefined();
  });
});

describe("page/Settings createAlert", () => {
  it("POSTs to /api/v1/recipients/create with token, fullName, value, and incidentTypes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ created: true }),
    });
    const r = await createAlert({
      type: "email",
      value: "x@y.com",
      fullName: "Bob",
      incidentTypes: ["fire"],
    });

    expect(waitForTokenMock).toHaveBeenCalled();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/v1/recipients/create");
    expect(url).toContain("alertType=email");
    expect(opts.headers["x-access-token"]).toBe("TOK_POST");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      email: "x@y.com",
      fullName: "Bob",
      incidentTypes: ["fire"],
    });
    expect(r).toEqual({ created: true });
  });

  it("defaults incidentTypes to [] when not provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({}),
    });
    await createAlert({ type: "sms", value: "555", fullName: "C" });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.incidentTypes).toEqual([]);
    expect(body.sms).toBe("555");
  });

  it("returns undefined when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("net"));
    const r = await createAlert({ type: "sms", value: "v", fullName: "f" });
    expect(r).toBeUndefined();
  });
});

describe("page/Settings resendMailOrSMS", () => {
  it("POSTs to /api/v1/recipients/resendMailOrSMS with id+alertType and returns body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ body: { resent: 1 } }),
    });
    const r = await resendMailOrSMS({
      id: "R-1",
      type: "email",
      value: "x@y.com",
    });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("alertType=email");
    expect(url).toContain("id=R-1");
    expect(opts.method).toBe("POST");
    expect(opts.headers["x-access-token"]).toBe("TOK_POST");
    expect(JSON.parse(opts.body)).toEqual({ email: "x@y.com" });
    expect(r).toEqual({ resent: 1 });
  });
});
