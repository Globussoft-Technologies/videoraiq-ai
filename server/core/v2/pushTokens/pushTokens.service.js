import Joi from "joi";
import PushToken from "./pushTokens.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";

const tokenSchema = Joi.object({
  token: Joi.string().trim().min(10).max(4096).required(),
  platform: Joi.string().valid("android", "ios", "web").required(),
});

class PushTokensService {
  /** Store (or re-own) this device's FCM token for the signed-in tenant. */
  async register(req, res) {
    try {
      const { error, value } = tokenSchema.validate(req.body);
      if (error) return res.status(400).json(Response.validationFailResp("Validation Failed", error.message));

      const { adminId, memberId, user_id } = req.verified?.userData || {};
      if (!adminId) return res.status(400).json(Response.validationFailResp("Validation Failed", "adminId missing from token"));

      await PushToken.findOneAndUpdate(
        { token: value.token },
        {
          token: value.token,
          platform: value.platform,
          adminId: String(adminId),
          userId: memberId ? String(memberId) : user_id != null ? String(user_id) : null,
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return res.status(200).json(Response.userSuccessResp("Push token registered", { platform: value.platform }));
    } catch (err) {
      logger.error(`[PUSH] register token failed: ${err.message}`);
      return res.status(500).json(Response.errorResp("Failed to register push token", err.message));
    }
  }

  /** Called on logout so the next person on this device doesn't get this tenant's alerts. */
  async unregister(req, res) {
    try {
      const { error, value } = tokenSchema.extract("token").validate(req.body?.token);
      if (error) return res.status(400).json(Response.validationFailResp("Validation Failed", error.message));

      const adminId = req.verified?.userData?.adminId;
      await PushToken.deleteOne({ token: value, adminId: String(adminId) });
      return res.status(200).json(Response.userSuccessResp("Push token removed", {}));
    } catch (err) {
      logger.error(`[PUSH] unregister token failed: ${err.message}`);
      return res.status(500).json(Response.errorResp("Failed to remove push token", err.message));
    }
  }
}

export default new PushTokensService();
