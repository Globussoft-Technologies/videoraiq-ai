import TelegramService from "../../../services/telegram.service.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";

class TelegramController {
  // GET /telegram/link-code  (authed)
  // Returns the admin's verification code + current link status. The client
  // shows the code and instructs the user to add the platform bot to their
  // channel as admin, then post the code in the channel.
  async getLinkCode(req, res) {
    /* #swagger.tags = ['Telegram'] */
    try {
      const adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Admin context missing"));
      }
      const result = await TelegramService.getLinkCode(adminId);
      if (!result) {
        return res.status(404).json(Response.notFoundResp("Admin not found"));
      }
      return res.status(200).json(
        Response.userSuccessResp("Telegram link code", result)
      );
    } catch (err) {
      logger.error(`telegram getLinkCode: ${err.message}`);
      return res.status(500).json(Response.errorResp("Failed to get link code", err.message));
    }
  }

  // POST /telegram/unlink  (authed)
  async unlink(req, res) {
    /* #swagger.tags = ['Telegram'] */
    try {
      const adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Admin context missing"));
      }
      await TelegramService.unlink(adminId);
      return res.status(200).json(Response.userSuccessResp("Telegram channel unlinked", {}));
    } catch (err) {
      logger.error(`telegram unlink: ${err.message}`);
      return res.status(500).json(Response.errorResp("Failed to unlink", err.message));
    }
  }

  // POST /telegram/webhook  (PUBLIC — Telegram calls this, no auth)
  // Always returns 200 quickly so Telegram doesn't retry; binding happens
  // best-effort inside handleUpdate.
  async webhook(req, res) {
    /* #swagger.tags = ['Telegram'] */
    /* #swagger.ignore = true */
    try {
      await TelegramService.handleUpdate(req.body);
    } catch (err) {
      logger.error(`telegram webhook: ${err.message}`);
    }
    return res.status(200).json({ ok: true });
  }
}

export default new TelegramController();
