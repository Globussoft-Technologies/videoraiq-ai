/**
 * src/page/user/Detection/Api/put/index.jsx — PRIVATE-CLONE-ONLY API leaf.
 *
 * The public mirror keeps the same two functions under
 * `Detection/Api/patch/index.jsx`; on the private clone the folder is
 * spelled `put/` instead and is *not* in the vitest include scope until
 * this round. (4th known clone divergence — joins
 * EmployeeRegister.jsx / VehicleCountLogs.jsx / AttendanceLogsLive.jsx.)
 *
 * Exports under test (both `axios.put`):
 *   - updateDetectionSettings(id, data) -> PUT /api/v1/detection-settings/:id
 *   - enableDetectionSettings(data)     -> PUT /api/v1/channel/detection/toggle
 *
 * Mocks (2):
 *   1. axios            -> default.put spy
 *   2. @/utils/getAccessToken -> returns a fixed bearer string
 *
 * Note: kept distinct from the existing patch.test.js (which targets the
 * public spelling `Detection/Api/patch/index.jsx`) so both can coexist
 * on their respective clones.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { put: axiosPut } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "AUTH_T"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { updateDetectionSettings, enableDetectionSettings } = await import(
  "../../../../../../src/page/user/Detection/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  axiosPut.mockResolvedValue({ data: { ok: true } });
  tokenMock.mockClear();
});

describe("page/Detection/Api/put updateDetectionSettings", () => {
  it("PUTs /api/v1/detection-settings/:id with the body + token header", async () => {
    await updateDetectionSettings("ds-42", { name: "x", enabled: true });
    expect(axiosPut).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/detection-settings\/ds-42$/);
    expect(body).toEqual({ name: "x", enabled: true });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.Accept).toBe("application/json");
    expect(tokenMock).toHaveBeenCalledTimes(1);
  });

  it("reads the bearer fresh on every call (so token rotation is honoured)", async () => {
    tokenMock.mockReturnValueOnce("T1").mockReturnValueOnce("T2");
    await updateDetectionSettings("a", {});
    await updateDetectionSettings("b", {});
    expect(axiosPut.mock.calls[0][2].headers["x-access-token"]).toBe("T1");
    expect(axiosPut.mock.calls[1][2].headers["x-access-token"]).toBe("T2");
    expect(tokenMock).toHaveBeenCalledTimes(2);
  });

  it("interpolates the id verbatim (no encoding, no trimming)", async () => {
    await updateDetectionSettings("weird id/with slashes", {});
    expect(axiosPut.mock.calls[0][0]).toMatch(
      /\/api\/v1\/detection-settings\/weird id\/with slashes$/
    );
  });

  it("forwards the body argument unchanged (no shape coercion)", async () => {
    const body = { nested: { deep: [1, 2, 3] }, num: 7, str: "v" };
    await updateDetectionSettings("id-1", body);
    // Same object reference is fine — the function should not clone.
    expect(axiosPut.mock.calls[0][1]).toBe(body);
  });

  it("returns the raw axios response (no unwrapping)", async () => {
    const fake = { data: { id: "x" }, status: 200 };
    axiosPut.mockResolvedValueOnce(fake);
    const r = await updateDetectionSettings("a", {});
    expect(r).toBe(fake);
  });

  it("propagates axios rejection", async () => {
    axiosPut.mockRejectedValueOnce(new Error("network down"));
    await expect(updateDetectionSettings("a", {})).rejects.toThrow(
      "network down"
    );
  });
});

describe("page/Detection/Api/put enableDetectionSettings", () => {
  it("PUTs /api/v1/channel/detection/toggle with the body + token header", async () => {
    await enableDetectionSettings({ channelId: "c-1", enabled: true });
    expect(axiosPut).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/channel\/detection\/toggle$/);
    expect(body).toEqual({ channelId: "c-1", enabled: true });
    expect(opts.headers["x-access-token"]).toBe("AUTH_T");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.Accept).toBe("application/json");
  });

  it("does not append any id to the toggle URL (constant endpoint)", async () => {
    await enableDetectionSettings({ enabled: false });
    expect(axiosPut.mock.calls[0][0]).toMatch(
      /\/api\/v1\/channel\/detection\/toggle$/
    );
    // No trailing segment beyond /toggle.
    expect(axiosPut.mock.calls[0][0]).not.toMatch(/\/toggle\/[^/]+/);
  });

  it("forwards the body argument unchanged (no shape coercion)", async () => {
    const body = { ids: ["a", "b"], enabled: true };
    await enableDetectionSettings(body);
    expect(axiosPut.mock.calls[0][1]).toBe(body);
  });

  it("returns the raw axios response (no unwrapping)", async () => {
    const fake = { data: { toggled: true }, status: 200 };
    axiosPut.mockResolvedValueOnce(fake);
    const r = await enableDetectionSettings({});
    expect(r).toBe(fake);
  });

  it("propagates axios rejection", async () => {
    axiosPut.mockRejectedValueOnce(new Error("403"));
    await expect(enableDetectionSettings({})).rejects.toThrow("403");
  });
});

describe("page/Detection/Api/put module shape", () => {
  it("exports exactly the documented two named functions", async () => {
    const mod = await import(
      "../../../../../../src/page/user/Detection/Api/put/index.jsx"
    );
    expect(typeof mod.updateDetectionSettings).toBe("function");
    expect(typeof mod.enableDetectionSettings).toBe("function");
    expect(mod.default).toBeUndefined();
  });

  it("declared as async functions — calls return Promises", () => {
    const r1 = updateDetectionSettings("a", {});
    const r2 = enableDetectionSettings({});
    expect(typeof r1.then).toBe("function");
    expect(typeof r2.then).toBe("function");
    return Promise.all([r1, r2]);
  });
});
