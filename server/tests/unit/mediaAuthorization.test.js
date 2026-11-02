import { describe, expect, it, vi } from "vitest";
import { Incident } from "../../core/v1/incidents/incidents.model.js";
import { canReadMedia } from "../../core/v2/Uploads/mediaAuthorization.js";

const account = "507f1f77bcf86cd799439011";
const request = (overrides = {}) => ({ verified: { userData: { adminId: account, user_id: "22" }, ...overrides } });

describe("media ownership authorization", () => {
  it("accepts a versioned path owned by the authenticated account", async () => {
    expect(await canReadMedia(request(), `v2/${account}/env/nas/image.jpg`)).toBe(true);
  });

  it("rejects a versioned path owned by another account", async () => {
    expect(await canReadMedia(request(), "v2/507f191e810c19729de860ea/env/nas/image.jpg")).toBe(false);
  });

  it("resolves legacy paths through incident ownership and member camera scope", async () => {
    const exists = vi.spyOn(Incident, "exists").mockResolvedValue(true);
    try {
      expect(await canReadMedia(request({ authorizedChannel: { channels: ["507f191e810c19729de860ea"] }, userData: { adminId: account, user_id: "22", memberId: "member-1" } }), "/legacy/image.jpg")).toBe(true);
      expect(exists.mock.calls[0][0].channelId).toEqual({ $in: ["507f191e810c19729de860ea"] });
    } finally { exists.mockRestore(); }
  });
});
