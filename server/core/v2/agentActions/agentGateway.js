/**
 * Agent identities may read through the normal v2 routes, but a mutation must
 * always carry an approved action id.  Keep this check shared by every legacy
 * mutation entry point so a newly added route cannot accidentally become a
 * write bypass.
 */
export const isAgentCredential = (req) => Boolean(
  req?.verified?.userData?.credentialType === "agent"
  || req?.verified?.userData?.actorType === "agent"
  || req?.verified?.userData?.isAgent === true,
);

export const principalType = (req) => (isAgentCredential(req) ? "agent" : "human");

export const isHumanCredential = (req) => principalType(req) === "human";

export const rejectAgentGatewayBypass = (req, res) => {
  if (!isAgentCredential(req) || req?.verified?.agentActionId) return false;
  res.status(403).json({
    statusCode: 403,
    body: {
      status: "failed",
      message: "Agent credentials must use the agent action gateway.",
      errorCode: "AGENT_ACTION_REQUIRED",
      error: { code: "AGENT_ACTION_REQUIRED" },
    },
  });
  return true;
};
