import { describe, expect, it, vi } from "vitest";
import {
  fetchHoneywellTvtCameras,
  normalizeHoneywellChannels,
} from "../../../core/v2/NVR/honeywellTvt.js";

const response = (payload, { ok = true, status = 200, token } = {}) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(payload),
  headers: { get: vi.fn().mockReturnValue(token || null) },
});

describe("Honeywell TVT discovery", () => {
  it("normalizes TVT channel names and generates both stream variants", () => {
    const cameras = normalizeHoneywellChannels({
      data: {
        channel_param: {
          items: [{ channel: "CH1", channel_name: "Entrance", ip_address: "10.0.0.21" }],
        },
      },
    });
    expect(cameras).toEqual([
      expect.objectContaining({
        channelId: "1",
        name: "Entrance",
        ipAddress: "10.0.0.21",
        streamEndpoint: "/ch",
        rtspChannels: expect.arrayContaining([
          expect.objectContaining({ id: "1_main" }),
          expect.objectContaining({ id: "1_sub" }),
        ]),
      }),
    ]);
  });

  it("uses digest login and the returned csrf token for discovery", async () => {
    const client = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(response({ result: "success", token: "session-token" }))
        .mockResolvedValueOnce(response({ data: { model: "I-HPNVR-416", channel_num: 1 } }))
        .mockResolvedValueOnce(response({ data: { channel_param: { items: [{ channel: "CH1" }] } } })),
    };

    const result = await fetchHoneywellTvtCameras({
      ip: "192.0.2.10",
      port: 80,
      username: "operator",
      password: "secret",
      client,
    });
    expect(result.deviceInfo.model).toBe("I-HPNVR-416");
    expect(result.cameras).toHaveLength(1);
    expect(client.fetch).toHaveBeenNthCalledWith(
      2,
      "http://192.0.2.10:80/API/Login/DeviceInfo/Get",
      expect.objectContaining({ headers: expect.objectContaining({ "X-csrftoken": "session-token" }) }),
    );
  });

  it("returns an actionable error when remote login is disabled", async () => {
    const client = {
      fetch: vi.fn().mockResolvedValue(
        response(
          { result: "failed", reason: "No remote login permission!", error_code: "no_permission" },
          { ok: false, status: 400 },
        ),
      ),
    };

    await expect(
      fetchHoneywellTvtCameras({
        ip: "192.0.2.10",
        port: 80,
        username: "operator",
        password: "secret",
        client,
      }),
    ).rejects.toThrow("Remote/Web login permission");
  });
});
