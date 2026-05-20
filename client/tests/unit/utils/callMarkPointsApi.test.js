/**
 * `callMarkPointsApi` POSTs to the DS detection service. We mock axios and
 * assert the URL + payload shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosPost = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: axiosPost } }));

const { callMarkPointsApi } = await import(
  "../../../src/utils/callMarkPointsApi.js"
);

beforeEach(() => axiosPost.mockReset());

describe("callMarkPointsApi", () => {
  it("posts the image, resolution, and a zones map keyed by additionalProp1", async () => {
    axiosPost.mockResolvedValue({ data: { ok: true } });
    const points = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const result = await callMarkPointsApi("BASE64_IMG", [1920, 1080], points);

    expect(axiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axiosPost.mock.calls[0];
    expect(url).toMatch(/\/mark_points$/);
    expect(body).toEqual({
      image_base64: "BASE64_IMG",
      source_resolution: [1920, 1080],
      zones: { additionalProp1: [[1, 2], [3, 4]] },
    });
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(result).toEqual({ data: { ok: true } });
  });

  it("flattens an empty points array to an empty additionalProp1 list", async () => {
    axiosPost.mockResolvedValue({ data: {} });
    await callMarkPointsApi("img", [800, 600], []);
    expect(axiosPost.mock.calls[0][1].zones.additionalProp1).toEqual([]);
  });
});
