/**
 * src/context/Api/get/index.jsx exports two GET helpers wrapped around axios.
 * Mock axios + getAccessToken and assert URL/header shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));

const tokenMock = vi.hoisted(() => vi.fn(() => "TOKEN_XYZ"));
vi.mock("@/utils/getAccessToken", () => ({ default: tokenMock }));

const {
  getAllUsesrPermissions,
  fetchLogsSound,
} = await import("../../../../src/context/Api/get/index.jsx");

beforeEach(() => {
  axiosGet.mockReset();
  tokenMock.mockClear();
});

describe("context/Api/get", () => {
  it("getAllUsesrPermissions calls /user-permissions with x-access-token header", async () => {
    axiosGet.mockResolvedValue({ data: { body: { data: [] } } });
    const result = await getAllUsesrPermissions();
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/permissions\/user-permissions$/);
    expect(opts.headers["x-access-token"]).toBe("TOKEN_XYZ");
    expect(opts.headers.Accept).toBe("application/json");
    expect(result.data.body.data).toEqual([]);
  });

  it("fetchLogsSound hits /admin/fetch-logs-sound with the same header shape", async () => {
    axiosGet.mockResolvedValue({ data: { body: { logsSound: true } } });
    const result = await fetchLogsSound();
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGet.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/admin\/fetch-logs-sound$/);
    expect(opts.headers["x-access-token"]).toBe("TOKEN_XYZ");
    expect(opts.headers.Accept).toBe("application/json");
    expect(result.data.body.logsSound).toBe(true);
  });

  it("propagates the rejection when axios.get rejects", async () => {
    axiosGet.mockRejectedValue(new Error("network down"));
    await expect(getAllUsesrPermissions()).rejects.toThrow("network down");
  });
});
