import { describe, expect, it, vi } from "vitest";
import { isAgentCredential, rejectAgentGatewayBypass } from "../../core/v2/agentActions/agentGateway.js";

const request = (userData = {}, agentActionId) => ({
  verified: { userData, ...(agentActionId ? { agentActionId } : {}) },
});

const response = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe("agent mutation gateway", () => {
  it.each([
    { credentialType: "agent" },
    { actorType: "agent" },
    { isAgent: true },
  ])("recognizes $credentialType agent identity", (userData) => {
    expect(isAgentCredential(request(userData))).toBe(true);
  });

  it("rejects a direct agent mutation with the required machine code", () => {
    const res = response();

    expect(rejectAgentGatewayBypass(request({ credentialType: "agent" }), res)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].body.errorCode).toBe("AGENT_ACTION_REQUIRED");
  });

  it("allows an approved internal action to reach the shared business function", () => {
    const res = response();

    expect(rejectAgentGatewayBypass(request({ credentialType: "agent" }, "507f1f77bcf86cd799439011"), res)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("does not reject ordinary product requests", () => {
    const res = response();

    expect(rejectAgentGatewayBypass(request({ userId: "product-user" }), res)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});
