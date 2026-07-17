/**
 * Auth.service — fetch-wrapped helpers and the custom-plan / top-up branches
 * of verifyUser. Uses a global fetch stub (vi.stubGlobal) and mocks the two
 * helper sync functions to no-ops so the in-memory MongoDB doesn't need any
 * extra seed data.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

vi.mock("../../../utils/helperFunctions.js", () => ({
  autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  syncPermissionLocations: vi.fn().mockResolvedValue(undefined),
  syncStevinrockLogPermissions: vi.fn().mockResolvedValue(undefined),
}));

const { default: AUTHService } = await import(
  "../../../core/v1/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  fetchMock.mockReset();
});

describe("AUTHService.getAmemberAccessByUserId", () => {
  it("returns the parsed JSON for a 2xx response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _total: 1,
        0: { product_id: "prodA", expire_date: "2031-01-01" },
      }),
    });
    const result = await AUTHService.getAmemberAccessByUserId(42);
    expect(result._total).toBe(1);
    expect(result[0].product_id).toBe("prodA");
    // URL was built with the user_id + apiKey.
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain("/access");
    expect(calledUrl).toContain("_filter[user_id]=42");
  });

  it("throws when the upstream response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => "boom",
    });
    await expect(AUTHService.getAmemberAccessByUserId(42)).rejects.toThrow(
      /aMember access API failed: boom/
    );
  });
});

describe("AUTHService.fetchUserDataByName", () => {
  it("returns the parsed JSON on a happy fetch", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, user_id: "1", login: "u" }),
    });
    const out = await AUTHService.fetchUserDataByName({
      login: "u",
      pass: "p",
    });
    expect(out.ok).toBe(true);
    expect(out.user_id).toBe("1");

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain("/check-access/by-login-pass");
    expect(calledUrl).toContain("login=u");
    expect(calledUrl).toContain("pass=p");
  });

  it("propagates a thrown fetch error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(
      AUTHService.fetchUserDataByName({ login: "u", pass: "p" })
    ).rejects.toThrow(/network down/);
  });
});

describe("AUTHService.getCustomPlanDetails", () => {
  it("returns the transformed plan for the first invoice", async () => {
    // First fetch: /users → returns [{ nested: { invoices: [...] }}]
    fetchMock.mockImplementationOnce(async () => ({
      json: async () => [
        {
          nested: {
            invoices: [{ invoice_id: "INV-1", status: "1" }],
          },
        },
      ],
    }));
    // Second fetch: /invoices/INV-1 → returns the invoice-items payload
    fetchMock.mockImplementationOnce(async () => ({
      json: async () => [
        {
          nested: {
            "invoice-items": [
              {
                options: JSON.stringify({ "Cloud Backup": true }),
              },
            ],
          },
        },
      ],
    }));
    const result = await AUTHService.getCustomPlanDetails(42);
    expect(result.planDetails.name).toBe("Basic Monitoring Plan");
    expect(result["Cloud Backup"]).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when there are no invoices", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => [{ nested: { invoices: [] } }],
    });
    const result = await AUTHService.getCustomPlanDetails(42);
    expect(result).toBeUndefined();
  });
});

describe("AUTHService.getTopUpPlanDetails", () => {
  it("aggregates per-invoice qty into transformTopUpData (Number coerces each invoice)", async () => {
    // /users → two invoices.
    fetchMock.mockImplementationOnce(async () => ({
      json: async () => [
        {
          nested: {
            invoices: [
              { invoice_id: "INV-A" },
              { invoice_id: "INV-B" },
            ],
          },
        },
      ],
    }));
    // The implementation does `Number(val || 0)` on each entry in
    // allCustomOptions. JSON.parse("10") → 10, so two invoices @ "10"
    // collapse to a total of 20 → +2 cameras and +3 storage days.
    fetchMock.mockImplementationOnce(async () => ({
      json: async () => [
        {
          nested: {
            "invoice-items": [{ qty: "10" }],
          },
        },
      ],
    }));
    fetchMock.mockImplementationOnce(async () => ({
      json: async () => [
        {
          nested: {
            "invoice-items": [{ qty: "10" }],
          },
        },
      ],
    }));
    const result = await AUTHService.getTopUpPlanDetails(42);
    expect(result["Connected Cameras"]).toBe(6);
    expect(result["Video Storage (Days)"]).toBe(10);
    expect(result.planDetails.price).toBe("$20");
  });

  it("returns defaults when there are no invoices", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => [{ nested: { invoices: [] } }],
    });
    const result = await AUTHService.getTopUpPlanDetails(42);
    // transformTopUpData([]) → defaults, price $0.
    expect(result.planDetails.price).toBe("$0");
    expect(result["Connected Cameras"]).toBe(4);
  });
});

/**
 * verifyUser custom-plan / top-up branches.
 *
 * The customPlanID/topUpPlanID strings come from setup.js — 9999 and 9998
 * respectively. Wiring fetch so that subscriptions has the matching key
 * exercises the corresponding branch.
 */
function authCtx() {
  const ctx = serviceCtx({ body: { login: "alice", pass: "p" } });
  ctx.req.header = () => undefined;
  return ctx;
}

describe("AUTHService.verifyUser — plan-specific branches", () => {
  it("returns a customPlan payload when subscription[0] === customPlanID", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.includes("/check-access/by-login-pass")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            user_id: "42",
            login: "alice",
            email: "alice@test.com",
            name_f: "Alice",
            name_l: "A",
            subscriptions: { 9999: "2099-12-31" },
          }),
        };
      }
      if (url.includes("/create_collection")) {
        return { status: 201 };
      }
      if (url.includes("/users?")) {
        return {
          json: async () => [
            {
              nested: {
                invoices: [{ invoice_id: "INV-1", status: "1" }],
              },
            },
          ],
        };
      }
      if (url.includes("/invoices/")) {
        return {
          json: async () => [
            {
              nested: {
                "invoice-items": [
                  { options: JSON.stringify({ "Cloud Backup": true }) },
                ],
              },
            },
          ],
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(res._body.user.applyCustomPlan).toBe(true);
    expect(res._body.user.customPlan).toBeDefined();
    expect(res._body.user.customPlan["Cloud Backup"]).toBe(true);
    // Admin row was created.
    expect(await Admin.findOne({ user_id: "42" })).not.toBeNull();
  });

  it("returns a topUpPlan payload when subscription[0] === topUpPlanID", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.includes("/check-access/by-login-pass")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            user_id: "55",
            login: "bob",
            email: "bob@test.com",
            name_f: "Bob",
            name_l: "B",
            subscriptions: { 9998: "2099-12-31" },
          }),
        };
      }
      if (url.includes("/create_collection")) {
        return { status: 201 };
      }
      if (url.includes("/users?")) {
        return {
          json: async () => [
            {
              nested: {
                invoices: [
                  { invoice_id: "INV-A" },
                  { invoice_id: "INV-B" },
                  { invoice_id: "INV-C" },
                ],
              },
            },
          ],
        };
      }
      if (url.includes("/invoices/")) {
        // Three invoices @ "10" → total $30 → Cloud Backup turns on.
        return {
          json: async () => [
            {
              nested: {
                "invoice-items": [{ qty: "10" }],
              },
            },
          ],
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { req, res } = authCtx();
    await AUTHService.verifyUser(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.user.applyTopUpPlan).toBe(true);
    expect(res._body.user.topUpPlan).toBeDefined();
    // $30 of top-up → Cloud Backup turns on.
    expect(res._body.user.topUpPlan["Cloud Backup"]).toBe(true);
    expect(await Admin.findOne({ user_id: "55" })).not.toBeNull();
  });
});
