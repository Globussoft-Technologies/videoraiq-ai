import authService from "../core/v1/Auth/auth.service.js";
import AUTHService from "../core/v1/Auth/auth.service.js";
import config from "config";
import Response from "../utils/response.js";
const APP_ENV = config.get("APP_ENV");
export const checkActivePlan = async (req, res, next) => {
  try {
    const user = req?.verified?.userData; // decoded JWT payload

    if (!user?.userSubscriptionType) {
      return res
        .status(403)
        .json(
          Response.planExpiredResp(
            "Your subscription plan has expired",
            "Your subscription plan has expired"
          )
        );
    }

    const isActive = AUTHService.isPlanActive({
      subscriptions: user.userSubscriptionType,
    });

    let detectionServiceRevokeSecretKey = config.get("detectionServiceRevokeSecretKey");
    let attendanceServiceRevokeSecretKey = config.get("attendanceServiceRevokeSecretKey");

    if (!isActive) {
      if(APP_ENV === 'local') {
        await authService.revokeAttendanceService(attendanceServiceRevokeSecretKey);
       await authService.revokeDetectionService(detectionServiceRevokeSecretKey);
      }
      return res
        .status(403)
        .json(
          Response.planExpiredResp(
            "Your subscription plan has expired",
            "Your subscription plan has expired"
          )
        );
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to validate subscription",
      error: error.message,
    });
  }
};

export const checkActivePlanSocket = async (socket, next) => {
  try {
    const user = socket?.user; // decoded JWT payload

    if (!user?.userSubscriptionType) {
      return next(new Error("Your subscription plan has expired"));
    }

    const isActive = AUTHService.isPlanActive({
      subscriptions: user.userSubscriptionType,
    });

    if (!isActive) {
      return next(new Error("Your subscription plan has expired"));
    }

    next();
  } catch (error) {
    return next(new Error("Failed to validate subscription"));
  }
};
