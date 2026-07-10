import axios from "axios";
import config from "config";
import logger from "../../utils/logger.js";
import { buildIncidentWhatsAppMessage } from "../message.helper.js";

const apiVersion = config.has("WhatsApp.apiVersion") ? config.get("WhatsApp.apiVersion") : "v20.0";
const defaultCountryCode = config.has("WhatsApp.defaultCountryCode")
  ? String(config.get("WhatsApp.defaultCountryCode"))
  : "91";

// Normalise a number to E.164: keep a leading +, strip spaces/dashes, and
// prepend the default country code for bare 10-digit local numbers.
const toE164 = (raw) => {
  if (!raw) return null;
  let n = String(raw).trim().replace(/[\s\-()]/g, "");
  if (n.startsWith("+")) return n;
  if (n.startsWith("00")) return `+${n.slice(2)}`;
  if (n.length === 10) return `+${defaultCountryCode}${n}`; // bare local number
  return `+${n}`;
};

// Send an incident alert to one or more numbers via the WhatsApp Cloud API.
// Non-blocking by design at the call site; here it resolves with per-number
// results and never throws for a single failed send.
export const sendIncidentWhatsApp = async (incident, recipientNumbers, nvrData = {}, channelData = {}, timezone = null) => {
  const phoneNumberId = config.get("WhatsApp.phoneNumberId");
  const accessToken = config.get("WhatsApp.accessToken");

  if (!phoneNumberId || !accessToken) {
    logger.warn("[WHATSAPP] Skipped — WhatsApp.phoneNumberId/accessToken not configured");
    return [];
  }

  if (!Array.isArray(recipientNumbers)) recipientNumbers = [recipientNumbers];

  const body = buildIncidentWhatsAppMessage(incident, nvrData, channelData, timezone);
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const results = await Promise.allSettled(
    recipientNumbers.map(async (raw) => {
      const to = toE164(raw);
      if (!to) throw new Error(`Invalid number: ${raw}`);
      const res = await axios.post(
        url,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: true, body },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );
      const messageId = res.data?.messages?.[0]?.id;
      logger.info(`[WHATSAPP] Sent to ${to}: ${messageId}`);
      return { to, messageId };
    }),
  );

  // Log failures individually; one bad number never blocks the others.
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.error(
        `[WHATSAPP] Failed to ${recipientNumbers[i]}:`,
        r.reason?.response?.data || r.reason?.message,
      );
    }
  });

  return results;
};
