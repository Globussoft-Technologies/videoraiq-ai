import config from 'config';
import { DETECTION_TYPES } from '../constants/detectionTypes.js';

// Map an incident's raw type (e.g. "personalProtectiveEquipment") to its
// human-readable label from DETECTION_TYPES (keys carry a "Settings" suffix).
// Falls back to the raw type (spaced) when there is no matching entry.
export const friendlyType = (incidentType) => {
  if (!incidentType) return "N/A";
  return (
    DETECTION_TYPES[incidentType] ||
    DETECTION_TYPES[`${incidentType}Settings`] ||
    String(incidentType).replace(/_/g, " ")
  );
};

// Format an incident timestamp in the admin's timezone. Falls back to the
// server's local zone when no valid IANA tz is given. Invalid tz strings are
// caught so a bad DB value can never throw inside a message builder.
export const formatIncidentTime = (timeOfIncident, timezone) => {
  if (!timeOfIncident) return "N/A";
  const d = new Date(timeOfIncident);
  if (!timezone) return d.toLocaleString();
  try {
    return d.toLocaleString("en-US", { timeZone: timezone });
  } catch {
    return d.toLocaleString();
  }
};

// Weekday name for an incident timestamp in the admin's timezone (same
// fallback rules as formatIncidentTime).
export const formatIncidentDay = (timeOfIncident, timezone) => {
  if (!timeOfIncident) return "N/A";
  const d = new Date(timeOfIncident);
  try {
    return d.toLocaleDateString("en-US", { weekday: "long", ...(timezone ? { timeZone: timezone } : {}) });
  } catch {
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }
};

export const buildIncidentMessage = (incident, timezone) => {
  const {
    incidentName,
    incidentType,
    timeOfIncident,
    severity,
    zone,
    cameraId,
    videoLink
  } = incident;

  const normalize = (text = '') =>
    text
      .replace(/[\u2018\u2019\u201C\u201D]/g, "'")  // smart quotes → apostrophe
      .replace(/[\u2002\u2003\u00A0]/g, ' ')       // en space/em space/nbsp → normal space
      .replace(/[^\x00-\x7F]/g, '');               // remove non-ASCII (optional)

  let details = `🚨 Type: ${normalize(friendlyType(incidentType))}\n`;
  details += `Time: ${formatIncidentTime(timeOfIncident, timezone)}\n`;
  if (videoLink) details += `📹 Video: ${normalize(videoLink)}\n`;

  return details;
};

// Full plain-text incident message for WhatsApp (WhatsApp text is plain text,
// so the HTML email template can't be sent as-is — this carries the same fields).
export const buildIncidentWhatsAppMessage = (incident = {}, nvrData = {}, channelData = {}, timezone = null) => {
  const {
    incidentName,
    incidentType,
    timeOfIncident,
    severity,
    zone,
    description,
    Image,
    videoLink,
    ConfidenceScoreInPercentage,
    vehicleNumber,
    vehicleType,
  } = incident;

  const cameraName = channelData?.customName || channelData?.name || incident?.cameraId || "N/A";
  const nvrName = nvrData?.nvrName || "N/A";
  const imageBase = config.has("ImageView") ? config.get("ImageView") : "";
  const imageUrl = Image ? (Image.startsWith("http") ? Image : `${imageBase}${Image}`) : "";

  const lines = [
    `🚨 *Incident Alert*`,
    `*Type:* ${friendlyType(incidentType)}`,
    incidentName ? `*Name:* ${incidentName}` : null,
    `*Time:* ${formatIncidentTime(timeOfIncident, timezone)}`,
    severity ? `*Severity:* ${severity}` : null,
    ConfidenceScoreInPercentage != null ? `*Confidence:* ${ConfidenceScoreInPercentage}%` : null,
    vehicleNumber ? `*Vehicle Number:* ${vehicleNumber}` : null,
    vehicleType ? `*Vehicle Type:* ${vehicleType}` : null,
    `*Camera:* ${cameraName}`,
    `*NVR:* ${nvrName}`,
    zone ? `*Zone:* ${zone}` : null,
    description ? `*Description:* ${description}` : null,
    imageUrl ? `📷 Snapshot: ${imageUrl}` : null,
    videoLink ? `📹 Video: ${videoLink}` : null,
  ].filter(Boolean);

  // WhatsApp text body limit is 4096 chars.
  return lines.join("\n").slice(0, 4096);
};

// Resolve an incident's snapshot to an absolute URL (empty string if none).
export const buildIncidentImageUrl = (incident = {}) => {
  const { Image } = incident;
  if (!Image) return "";
  if (Image.startsWith("http")) return Image;
  const imageBase = config.has("ImageView") ? config.get("ImageView") : "";
  return `${imageBase}${Image}`;
};

// Full incident message for the Telegram channel (Markdown). Mirrors the
// WhatsApp builder; Telegram *bold* uses single asterisks like WhatsApp.
export const buildIncidentTelegramMessage = (incident = {}, nvrData = {}, channelData = {}, timezone = null) => {
  const {
    incidentName,
    incidentType,
    timeOfIncident,
    severity,
    zone,
    description,
    dispatchEntryTime,
    ConfidenceScoreInPercentage,
    vehicleNumber,
    vehicleType,
  } = incident;

  // MarkdownV2 requires escaping these chars in any text/value so that user
  // data (names, descriptions) can't break Telegram's parser.
  const escapeMdV2 = (v) =>
    String(v ?? "N/A").replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
  // Uppercase, then escape — used for the dynamic values.
  const up = (v) => escapeMdV2(String(v ?? "N/A").toUpperCase());
  const cameraName = channelData?.customName || channelData?.name || incident?.cameraId || "N/A";
  const nvrName = nvrData?.nvrName || "N/A";

  // vehicleObstruction tracks a dispatch window: entry time arrives in the
  // trigger payload, timeOfIncident is the exit. Other types keep plain Time.
  const timeLines =
    incidentType === "vehicleObstruction"
      ? [
          `*Dispatch Entry Time:* ${dispatchEntryTime ? up(formatIncidentTime(dispatchEntryTime, timezone)) : "N/A"}`,
          `*Dispatch Exit Time:* ${timeOfIncident ? up(formatIncidentTime(timeOfIncident, timezone)) : "N/A"}`,
        ]
      : [`*Time:* ${timeOfIncident ? up(formatIncidentTime(timeOfIncident, timezone)) : "N/A"}`];

  const lines = [
    `🚨 *INCIDENT ALERT*`,
    ``,
    `*Type:* ${up(friendlyType(incidentType))}`,
    incidentName ? `*Name:* ${up(incidentName)}` : null,
    `*Day:* ${up(formatIncidentDay(timeOfIncident, timezone))}`,
    ...timeLines,
    severity ? `*Severity:* ${up(severity)}` : null,
    // up() escapes the decimal point — MarkdownV2 requires it.
    ConfidenceScoreInPercentage != null ? `*Confidence:* ${up(`${ConfidenceScoreInPercentage}%`)}` : null,
    vehicleNumber ? `*Vehicle Number:* ${up(vehicleNumber)}` : null,
    vehicleType ? `*Vehicle Type:* ${up(vehicleType)}` : null,
    `*Camera:* ${up(cameraName)}`,
    `*NVR:* ${up(nvrName)}`,
    zone ? `*Zone:* ${up(zone)}` : null,
    description ? `*Description:* ${up(description)}` : null,
  ].filter(Boolean);

  // Telegram message limit is 4096 chars.
  return lines.join("\n").slice(0, 4096);
};

export const buildVerificationLinkMessage = (token) => {
  const verificationUrl = `${config.get('verificationLink')}${token}`;
  return `Click the link below to verify your email:\n${verificationUrl}\n\nThis link will expire in 10 minutes.`;
};
