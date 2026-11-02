import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../admin/admin.model.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import { DEFAULT_ADMIN_TIMEZONE, validTimezone } from "../../../utils/timezone.js";

const receiptSchema = new mongoose.Schema({ _id: String, expiresAt: { type: Date, required: true } });
receiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ProducerReceipt = mongoose.models.AgentProducerReceipt || mongoose.model("AgentProducerReceipt", receiptSchema);
const kinds = ["runtime", "outages", "reviews", "lifecycles", "groups", "contexts", "evidence"];
export function producerBodyDigest(body) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  return crypto.createHash("sha256").update(JSON.stringify(canonical(body || {}))).digest("hex");
}

export function verifyProducerClaims(token, req, settings = process.env) {
  const key = settings.AGENT_DATA_PRODUCER_PUBLIC_KEY?.replace(/\\n/g, "\n");
  const issuer = settings.AGENT_DATA_PRODUCER_ISSUER;
  const subjects = String(settings.AGENT_DATA_PRODUCER_SUBJECTS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!key || !issuer || !subjects.length) throw new Error("Producer authentication is not configured.");
  const claims = jwt.verify(token, key, { algorithms: ["RS256"], issuer, audience: "videoraiq-agent-data", maxAge: "5m" });
  const kind = req.path.replace(/^\//, "");
  if (req.method !== "POST" || !kinds.includes(kind) || !subjects.includes(claims.sub)
    || !mongoose.isValidObjectId(claims.adminId) || !claims.jti
    || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || claims.exp <= claims.iat
    || claims.exp - claims.iat > 300 || claims.iat > Math.floor(Date.now() / 1000)
    || !Array.isArray(claims.scopes) || !claims.scopes.includes(`agent-data:${kind}:write`)
    || claims.method !== "POST" || claims.path !== `/api/v2/agent-data/${kind}`
    || claims.bodySha256 !== producerBodyDigest(req.body)) throw new Error("Invalid producer scope or request signature.");
  return claims;
}

export default async function authenticateAgentData(req, res, next) {
  const token = req.get("x-agent-data-token");
  if (!token) return verifyToken(req, res, next);
  try {
    const claims = verifyProducerClaims(token, req);
    const admin = await Admin.findById(claims.adminId).select("user_id timezone").lean();
    if (!admin) throw new Error("Unknown producer account.");
    await ProducerReceipt.create({ _id: crypto.createHash("sha256").update(`${claims.iss}:${claims.jti}`).digest("hex"), expiresAt: new Date(claims.exp * 1000) });
    req.verified = { state: true, producer: { subject: claims.sub, scopes: claims.scopes }, userData: {
      adminId: String(admin._id), user_id: admin.user_id, credentialType: "producer",
      timezone: validTimezone(admin.timezone) || DEFAULT_ADMIN_TIMEZONE,
    } };
    next();
  } catch (error) {
    const replay = error?.code === 11000;
    return res.status(replay ? 409 : 401).json({ statusCode: replay ? 409 : 401, body: {
      status: "failed", errorCode: replay ? "PRODUCER_REPLAY" : "INVALID_PRODUCER_SIGNATURE",
      message: replay ? "Producer request was already consumed; reconcile before retrying." : "Producer authentication failed.",
    } });
  }
}
