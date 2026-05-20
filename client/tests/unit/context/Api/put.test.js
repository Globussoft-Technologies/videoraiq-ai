/**
 * src/context/Api/put/index.jsx exports updateLogsSound — a PUT call to the
 * admin endpoint. Mock axios + getAccessToken.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPut = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { put: axiosPut } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "TOKEN_PUT"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const { updateLogsSound } = await import(
  "../../../../src/context/Api/put/index.jsx"
);

beforeEach(() => {
  axiosPut.mockReset();
  tokenMock.mockClear();
});

describe("context/Api/put updateLogsSound", () => {
  it("PUTs the boolean-coerced logsSound and forwards the response", async () => {
    axiosPut.mockResolvedValue({ data: { ok: true } });
    const res = await updateLogsSound(true);
    expect(axiosPut).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPut.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/admin\/update-logs-sound$/);
    expect(body).toEqual({ logsSound: true });
    expect(opts.headers["x-access-token"]).toBe("TOKEN_PUT");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(res.data.ok).toBe(true);
  });

  it("coerces falsy input to false in the body", async () => {
    axiosPut.mockResolvedValue({ data: {} });
    await updateLogsSound(0);
    expect(axiosPut.mock.calls[0][1]).toEqual({ logsSound: false });
  });

  it("coerces truthy non-bool input to true", async () => {
    axiosPut.mockResolvedValue({ data: {} });
    await updateLogsSound("yes please");
    expect(axiosPut.mock.calls[0][1]).toEqual({ logsSound: true });
  });

  it("propagates rejection when axios.put rejects", async () => {
    axiosPut.mockRejectedValue(new Error("server gone"));
    await expect(updateLogsSound(true)).rejects.toThrow("server gone");
  });
});
