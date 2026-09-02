import Response from "../utils/response.js";
import config from "config";
import jwt from "jsonwebtoken";
import superAdminModel from "../core/v1/superAdmin/superAdmin.model.js";

const jwtSecret = config.get("jwt.secretKey");

function getRequestToken(req) {
  const accessToken = req.header("x-access-token");
  if (accessToken) return accessToken;

  const authorization = req.header("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() || "";
}

// Guards super-admin-only routes. Accepts the JWT issued by superAdmin signIn
// (payload { id, email, role: 'superAdmin' }, signed with jwt.secretKey).
async function verifySuperAdmin(req, res, next) {
  try {
    const token = getRequestToken(req);
    if (!token) {
      return res.status(401).send(Response.tokenFailResp("Access token is required"));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).send(Response.tokenFailResp("Invalid access token"));
    }

    if (decoded?.role !== "superAdmin" || !decoded?.id) {
      return res.status(403).send(Response.accessDeniedResp("Super admin access required"));
    }

    const superAdmin = await superAdminModel.findById(decoded.id).select("-password");
    if (!superAdmin) {
      return res.status(401).send(Response.tokenFailResp("Super admin not found"));
    }

    req.superAdmin = superAdmin;
    return next();
  } catch (e) {
    return res.status(401).send(Response.tokenFailResp("Invalid access token"));
  }
}

export default verifySuperAdmin;
