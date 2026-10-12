import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import TelegramService from "../../../services/telegram.service.js";
import { telegramChannels, selectedTelegramChannels, telegramBotToken, telegramBotUsername } from "./telegramChannels.js";

const responseData = recipient => ({ code: recipient?.telegramLinkCode || null, channels: telegramChannels(recipient || {}),
  selectedChatId: selectedTelegramChannels(recipient || {})[0]?.chatId || "",
  botUsername: telegramBotUsername(), botConfigured: !!telegramBotToken(), collectorEnabled: monitoringSettings().enabled });

function handler(action, message) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.send(Response.SuccessResp(message, await action(req))); }
    catch (error) {
      if (!error.status) logger.error("[STREAM_TELEGRAM] channel request failed");
      const status = error.status || 500;
      return res.status(status).send({ statusCode: status, body: { status: "failed",
        message: error.status ? error.message : "Unable to load or update Telegram channels" } });
    }
  };
}

export const getTelegramSettings = handler(async req =>
  responseData(await TelegramService.getSuperAdminLinkCode(req.superAdmin._id)), "Telegram link code and channels fetched");

export const selectTelegramChannel = handler(async req =>
  responseData(await TelegramService.selectSuperAdminChannel(req.superAdmin._id, req.body?.chatId)), "Telegram delivery channel selected");

export const unlinkTelegramChannel = handler(async req =>
  responseData(await TelegramService.unlinkSuperAdminChannel(req.superAdmin._id, req.body?.chatId)), "Telegram channel disconnected");
