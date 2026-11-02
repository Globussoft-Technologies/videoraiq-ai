import { describe, expect, it, vi } from "vitest";
import { AgentAction } from "../../core/v2/agentActions/agentActions.model.js";
import service from "../../core/v2/agentActions/agentActions.service.js";

const response = () => ({ status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } });

describe("agent action history scope", () => {
  it("combines an actor filter with the caller scope rather than replacing it", async () => {
    const find = vi.spyOn(AgentAction, "find").mockReturnValue({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) });
    const count = vi.spyOn(AgentAction, "countDocuments").mockResolvedValue(0);
    try {
      const req = {
        query: { actor: "another-member" },
        verified: { userData: { adminId: "507f1f77bcf86cd799439011", memberId: "member-1" }, permissionConfig: [{ permissionConfig: { channels: { view: true } } }], authorizedChannel: { channels: ["507f191e810c19729de860ea"] } },
        header: () => "request-1",
      };
      const res = response();
      await service.list(req, res);
      expect(res.code).toBe(200);
      expect(find.mock.calls[0][0]).toMatchObject({
        accountId: req.verified.userData.adminId,
        $and: [
          { $or: [{ "requester.subject": "member-1" }, { "approver.subject": "member-1" }] },
          { $or: [{ "requester.subject": "another-member" }, { "approver.subject": "another-member" }] },
        ],
      });
      expect(count.mock.calls[0][0]).toEqual(find.mock.calls[0][0]);
      expect(find.mock.calls[0][0].targets.$not.$elemMatch.channelId.$nin.map(String)).toEqual(["507f191e810c19729de860ea"]);
    } finally { find.mockRestore(); count.mockRestore(); }
  });
  it("checks all currently assigned targets when loading action detail", async () => {
    const find = vi.spyOn(AgentAction, "findOne").mockResolvedValue(null);
    try {
      const req = {
        params: { actionId: "507f1f77bcf86cd799439012" },
        verified: { userData: { adminId: "507f1f77bcf86cd799439011", memberId: "member-1" }, authorizedChannel: { channels: [] }, permissionConfig: [{ permissionConfig: { channels: { view: true } } }] },
      };
      const res = response();
      await service.get(req, res);
      expect(res.code).toBe(404);
      expect(find.mock.calls[0][0].targets.$not.$elemMatch.channelId.$nin).toEqual([]);
    } finally { find.mockRestore(); }
  });
  it("denies detail reads when member view permission was revoked", async () => {
    const find = vi.spyOn(AgentAction, "findOne");
    try {
      const res = response();
      await service.get({
        params: { actionId: "507f1f77bcf86cd799439012" },
        verified: { userData: { adminId: "507f1f77bcf86cd799439011", memberId: "member-1" }, permissionConfig: [{ permissionConfig: { channels: { view: false } } }] },
      }, res);
      expect(res.code).toBe(403);
      expect(find).not.toHaveBeenCalled();
    } finally { find.mockRestore(); }
  });
});
