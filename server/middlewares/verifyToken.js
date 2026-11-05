import Response from "../utils/response.js";
import config from "config";
import jwt from "jsonwebtoken";
// import { adminPaths, userPaths } from './RoutesAccess.js';
import User from "../core/v1/users/users.model.js";
import adminModel from "../core/v1/admin/admin.model.js";
import { ObjectId } from "mongodb";
import roleModel from "../core/v1/roles/roles.model.js";
import authorizedChannelsModel from "../core/v1/cameraRestrictions/authorizedChannels.model.js";
import { checkActivePlan } from "./checkActivePlan.js";
import { getEmpAuthInfo } from "../utils/helperFunctions.js";
import sessionsService from "../core/v2/sessions/sessions.service.js";
import { DEFAULT_ADMIN_TIMEZONE, validTimezone } from "../utils/timezone.js";
import { checkKeyOwnership } from '../core/v2/apiKeys/apiKey.ownership.js';
import { rememberRequestAdmin } from '../utils/requestAdmin.js';

const backendToken = config.get("Backend.token");
let jwtSecret = config.get("jwt.secretKey");

const AGENT_READ_POST = [
  /^\/api\/v2\/(?:attendance\/(?:get|user-logs)|accessLogs\/(?:getAccessLogs|getUserSessionReport)|authorizedChannels\/(?:fetchChannels|getChannels|locations)|authorizedUsers\/fetch|dashboard\/headerStats|incidents\/?|users\/fetch|roles\/get|locations\/fetch|departments\/get|recipients\/fetch|agent-data\/analytics\/query|channel\/playback-url)\/?$/,
];
const AGENT_READ_GET = [
  /^\/api\/v2\/admin\/(?:allowed-detections|timezone)\/?$/,
  /^\/api\/v2\/agent-actions(?:\/[^/]+)?\/?$/,
  /^\/api\/v2\/agent-data\/(?:contexts|evidence|groups|lifecycles|outages|reviews|schedules)\/?$/,
  /^\/api\/v2\/analytics\/(?:activity-heatmap|attendance-presence|attendance-summary|detections-by-hour|detection-volume|engine-share|overview|peak-activity|response-funnel|site-performance|top-cameras)\/?$/,
  /^\/api\/v2\/attendance\/settings\/?$/,
  /^\/api\/v2\/audit-events\/?$/,
  /^\/api\/v2\/channel\/(?:details|detection-status|[0-9a-fA-F]{24})\/?$/,
  /^\/api\/v2\/dashboard\/recentIncidents\/?$/,
  /^\/api\/v2\/detection-settings(?:\/[^/]+(?:\/schedule(?:\/[^/]+)?)?)?\/?$/,
  /^\/api\/v2\/incidents\/(?:getIncident|logs\/[^/]+(?:\/[^/]+){0,2})\/?$/,
  /^\/api\/v2\/permissions\/user-permissions\/?$/,
  /^\/api\/v2\/shifts(?:\/[^/]+)?\/?$/,
  /^\/api\/v2\/uploads\/[^?]+$/,
];
export function delegatedRouteAllowed(req, scopes) {
  const path = req.originalUrl.split('?')[0];
  if (req.method === 'GET') return AGENT_READ_GET.some((pattern) => pattern.test(path));
  if (req.method !== 'POST') return false;
  if (AGENT_READ_POST.some((pattern) => pattern.test(path))) return true;
  if (scopes.includes('prepare') && path === '/api/v2/agent-actions/prepare') return true;
  if (scopes.includes('prepare') && /^\/api\/v2\/agent-actions\/[^/]+\/execute$/.test(path)) return true;
  return false;
}

export const isRegistrationLinkActive = (decoded, registrationLink, now = Date.now()) => {
  if (!decoded?.registrationLinkId) return true;
  return Boolean(
    registrationLink?.linkId === decoded.registrationLinkId
      && new Date(registrationLink.expiresAt).getTime() > now
  );
};

async function verifyToken(req, res, next) {
  try {
    if (req.verified?.apiKey && req.verified?.userData?.tokenType === 'api-key') {
      try { await checkKeyOwnership(req, { _id: req.verified.userData.adminId, user_id: req.verified.userData.user_id }); }
      catch { return res.status(403).json(Response.accessDeniedResp('Resource access is not allowed for this admin')); }
      req.mainRoute = `${req.baseUrl}${req.path}`.replace(/\/[0-9a-fA-F]{24}(?=\/|$)/g, ':id');
      return next();
    }
    // <video>/dash.js/hls.js fetch fragments directly and can't attach custom
    // headers, so the header stays authoritative and this is only a fallback
    // for those media requests — same convention the frontend already uses
    // against the external streaming server (useHlsPlayer.js's ?token=).
    const token = req.header("x-access-token") || req.query?.token;

    if (!token) {
      return res
        .status(401)
        .send(Response.tokenFailResp("Access token is required"));
    }

    try {
      const decodedServiceToken = jwt.verify(token, backendToken);
      if (decodedServiceToken?.service === "python-backend") {
        req.verified = {
          state: true,
          userData: { system: true, service: decodedServiceToken.service },
        };
        return next();
      }
    } catch (err) {
      // Not a valid service token – fall through to user token verification
    }

    // First try verifying as a service token
    let routes, routesValue;
    // Verify the token
    jwt.verify(token, jwtSecret, async (_error, decoded) => {
      if (decoded) {
        if (decoded.tokenType === 'detection-agent' &&
          (!Array.isArray(decoded.scopes) || !delegatedRouteAllowed(req, decoded.scopes))) {
          return res.status(403).json(Response.accessDeniedResp('Delegated token is not permitted for this route'));
        }
        if (decoded.tokenType === 'mobile-embed') {
          try {
            const { enforceEmbeddedAccess } = await import('../core/v2/mobileAccess/mobileAccess.service.js');
            if (!await enforceEmbeddedAccess(req, decoded)) return res.status(401).json(Response.tokenFailResp('Embedded access expired or revoked'));
          } catch {
            return res.status(401).json(Response.tokenFailResp('Embedded access unavailable'));
          }
        }
        let roleWithPermission = null;
        let authorizedChannel = null;
        // Determine the route access
        if (!decoded?.memberId) {
          // Fetch the Admin data from the database
          const admin = await adminModel.findById({
            _id: new Object(decoded?.adminId),
          }); // Replace with your ID field
          if (!admin) {
            return res
              .status(401)
              .send(Response.tokenFailResp("admin not found"));
          }
          if (!isRegistrationLinkActive(decoded, admin.registrationLink)) {
            return res
              .status(401)
              .send(Response.tokenFailResp("Registration link is invalid or has expired"));
          }
          decoded.adminTimezoneConfigured = Boolean(validTimezone(admin.timezone));
          rememberRequestAdmin(req, admin);
          decoded.timezone = validTimezone(admin.timezone) || DEFAULT_ADMIN_TIMEZONE;
          // Check if the password was changed after the token was issued
          // if (admin.passwordChangedAt && decoded.iat * 1000 < admin.passwordChangedAt.getTime()) {
          //     return res.status(401).send(Response.tokenFailResp('Session expired. Please log in again.'));
          // }
          routes = req.originalUrl;
          routesValue = routes.split("?");
        } else {
          const admin = await adminModel.findById(decoded?.adminId);
          if (!admin) {
            return res
              .status(401)
              .send(Response.tokenFailResp("admin not found"));
          }
          decoded.adminTimezoneConfigured = Boolean(validTimezone(admin.timezone));
          rememberRequestAdmin(req, admin);
          decoded.timezone = validTimezone(admin.timezone) || DEFAULT_ADMIN_TIMEZONE;
          const user = await User.findOne({ _id: decoded?.memberId }); // Replace with your ID field
          authorizedChannel = await authorizedChannelsModel.findOne({
            userId: decoded?.memberId,
          });
          //   if (!user) {
          //       return res.status(401).send(Response.tokenFailResp('User not found'));
          //   }
          // // Check if the password was changed after the token was issued
          // if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
          //     return res.status(401).send(Response.tokenFailResp('Session expired. Please log in again.'));
          // }
          routes = req.originalUrl;
          routesValue = routes.split("?");

          roleWithPermission = await roleModel.aggregate([
            { $match: { _id: user?.roleIds } },
            {
              $lookup: {
                from: "permissionschemas",
                localField: "permissionId",
                foreignField: "_id",
                as: "permissionDetails",
                pipeline: [{ $project: { permissionConfig: 1, _id: 0 } }],
              },
            },
            { $unwind: "$permissionDetails" },
            {
              $project: {
                permissionConfig: "$permissionDetails.permissionConfig",
              },
            },
          ]);
        }
        decoded.userId = decoded.userId;
        if (decoded?.service === "python-backend") {
          decoded.system = true;
        }

        // Fetch orgId from EMP auth info if user_email is available
        if (decoded?.user_email) {
          try {
            const empData = await getEmpAuthInfo(decoded?.user_email, { scope: decoded.adminId });
            if (empData?.data?.[0]?.id) {
              decoded.orgId = empData.data[0].id;
            }
          } catch (_err) {
            // Silently continue without orgId if EMP API fails
          }
        }

        // Attach the verified result to the request
        req.verified = {
          state: true,
          userData: decoded,
          permissionConfig: roleWithPermission,
          authorizedChannel: authorizedChannel,
        };

        // console.log(`${req.baseUrl}${req.path}`,'path123');
        req.mainRoute = `${req.baseUrl}${req.path}`.replace(
          /\/[0-9a-fA-F]{24}(?=\/|$)/g,
          ":id",
        );

        const sessionAccess = await sessionsService.enforceRequestSession(req, decoded);
        if (!sessionAccess.allowed) {
          return res.status(sessionAccess.statusCode).send({
            statusCode: sessionAccess.statusCode,
            body: sessionAccess.body,
          });
        }

        checkActivePlan(req, res, next)
        // next();
      } else {
        const code = _error?.name === 'TokenExpiredError' ? 'ACCESS_TOKEN_EXPIRED' : 'ACCESS_TOKEN_INVALID';
        return res.status(401).send({ ...Response.tokenFailResp("Invalid access token"), code });
      }
    });
  } catch (e) {
    console.log(e, "error in verify token");
    return res.status(401).send(Response.tokenFailResp("Invalid access token"));
  }
}

export default verifyToken;
