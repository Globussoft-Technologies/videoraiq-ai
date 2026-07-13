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

const backendToken = config.get("Backend.token");
let jwtSecret = config.get("jwt.secretKey");

async function verifyToken(req, res, next) {
  try {
    const token = req.header("x-access-token");

    if (!token) {
      return res
        .status(401)
        .send(Response.tokenFailResp("Access token is required"));
    }

    try {
      const token = req.header("x-access-token");

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
        let roleWithPermission = null;
        let authorizedChannel = null;
        // Determine the route access
        if (!decoded?.memberId) {
          // Reject early if the token carries no valid adminId. Without this,
          // new Object(undefined) => {} and findById({ _id: {} }) throws a
          // CastError that (as an unhandled rejection) used to crash the server.
          if (!ObjectId.isValid(decoded?.adminId)) {
            return res
              .status(401)
              .send(Response.tokenFailResp("Invalid token: missing adminId"));
          }
          // Fetch the Admin data from the database
          const admin = await adminModel.findById(decoded.adminId);
          if (!admin) {
            return res
              .status(401)
              .send(Response.tokenFailResp("admin not found"));
          }
          // Check if the password was changed after the token was issued
          // if (admin.passwordChangedAt && decoded.iat * 1000 < admin.passwordChangedAt.getTime()) {
          //     return res.status(401).send(Response.tokenFailResp('Session expired. Please log in again.'));
          // }
          routes = req.originalUrl;
          routesValue = routes.split("?");
        } else {
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
            const empData = await getEmpAuthInfo(decoded?.user_email);            
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
        checkActivePlan(req, res, next)
        // next();
      } else {
        return res
          .status(401)
          .send(Response.tokenFailResp("Invalid access token"));
      }
    });
  } catch (e) {
    console.log(e, "error in verify token");
    return res.status(401).send(Response.tokenFailResp("Invalid access token"));
  }
}

export default verifyToken;
