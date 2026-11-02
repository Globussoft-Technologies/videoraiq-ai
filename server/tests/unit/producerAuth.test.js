import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { producerBodyDigest, verifyProducerClaims } from "../../core/v2/agentData/producerAuth.js";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const body = { channelId: "507f191e810c19729de860ea", detectionType: "ppe", runtimeState: "running" };
const req = { method: "POST", path: "/runtime", body };
const settings = { AGENT_DATA_PRODUCER_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }), AGENT_DATA_PRODUCER_ISSUER: "detection-service", AGENT_DATA_PRODUCER_SUBJECTS: "detector-01" };

function token(overrides = {}) {
  return jwt.sign({ adminId: "507f1f77bcf86cd799439011", method: "POST", path: "/api/v2/agent-data/runtime", scopes: ["agent-data:runtime:write"], bodySha256: producerBodyDigest(body), ...overrides }, privateKey, { algorithm: "RS256", issuer: "detection-service", audience: "videoraiq-agent-data", subject: "detector-01", jwtid: crypto.randomUUID(), expiresIn: 300 });
}

describe("signed agent-data producer contract", () => {
  it("accepts a scoped body-bound producer token", () => {
    expect(verifyProducerClaims(token(), req, settings).sub).toBe("detector-01");
  });

  it("rejects a token whose body digest does not match", () => {
    expect(() => verifyProducerClaims(token(), { ...req, body: { ...body, runtimeState: "failed" } }, settings)).toThrow();
  });
});
