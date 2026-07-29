import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import config from "config";
import { generateToken } from "../../../middlewares/decodeToken.js";

/**
 * Standalone auth for the Email Monitoring dashboard.
 *
 * Credentials live in config (`emailMonitoring.username` / `.password`); a
 * successful login returns a 1-day HS512 token that every other route in this
 * module requires. Deliberately separate from the main app's verifyToken —
 * this dashboard has its own login and its own secret, so a token from one
 * side is not accepted by the other.
 *
 * Required config block (per environment):
 *   "emailMonitoring": {
 *     "username": "opsadmin",
 *     "password": "<the shared password>",
 *     "jwtSecret": "<32 random bytes, hex — NOT token_secret>"
 *   }
 */

// Read through config.has so a missing block yields a clean 500/401 instead of
// crashing the whole backend at import time, which a top-level config.get would.
const cfg = (key) =>
  config.has(`emailMonitoring.${key}`) ? config.get(`emailMonitoring.${key}`) : null;

// ponytail: guessing the single config password is the entire attack surface,
// so the login route gets a limiter. Raise the cap if ops trips it.
export const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });

export const login = (req, res) => {
  const { username, password } = req.body || {};
  const secret = cfg("jwtSecret");

  if (!secret || !cfg("username") || !cfg("password")) {
    return res
      .status(500)
      .json({ message: "Email monitoring auth is not configured" });
  }

  if (username !== cfg("username") || password !== cfg("password")) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  return res.json({
    token: generateToken({ sub: username, scope: "email-monitoring" }, secret, "1d"),
    expiresIn: 86_400,
  });
};

export const requireEmailAuth = (req, res, next) => {
  try {
    const claims = jwt.verify(
      (req.headers.authorization || "").replace(/^Bearer /, ""),
      cfg("jwtSecret"),
      { algorithms: ["HS512"] }
    );
    // A main-app token must not unlock this dashboard even if the secrets ever
    // get pointed at the same value.
    if (claims.scope !== "email-monitoring") throw new Error("wrong scope");
    req.emailUser = claims.sub;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
