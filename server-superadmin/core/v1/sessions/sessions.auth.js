import config from "config";
import jwt from "jsonwebtoken";
import verifyToken from "../../../middlewares/verifyToken.js";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";

const jwtSecret = config.get("jwt.secretKey");

function getRequestToken(req) {
  const accessToken = req.header("x-access-token");
  if (accessToken) return accessToken;

  const authorization = req.header("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() || "";
}

export default function verifySessionAccess(req, res, next) {
  const token = getRequestToken(req);

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (decoded?.role === "superAdmin") {
      return verifySuperAdmin(req, res, next);
    }
  } catch (_err) {
    // Let verifyToken return the existing project error shape.
  }

  return verifyToken(req, res, next);
}
