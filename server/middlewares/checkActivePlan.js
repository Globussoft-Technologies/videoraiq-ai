import AUTHService from "../core/v1/Auth/auth.service.js";
import Response from "../utils/response.js";

import { expireSubscription } from '../services/subscriptionExpiry.js';

export const checkActivePlan = async (req, res, next) => {
  try {
    const user = req?.verified?.userData; // decoded JWT payload

    if (!user?.userSubscriptionType) {
      // No subscription = expired; stop this admin's detection + face-auth streams.
      // No subscription map here, so there is no expiry date to send.
      await expireSubscription(user?.adminId);
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

    if (!isActive) {
      // Persist account-scoped pause state before rejecting the request.
      await expireSubscription(user?.adminId);
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
