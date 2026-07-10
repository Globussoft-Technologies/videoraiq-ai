import config from 'config';

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

  let details = `🚨 Type: ${normalize(incidentType.replace(/_/g, ' '))}\n`;
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
  } = incident;

  const cameraName = channelData?.customName || channelData?.name || incident?.cameraId || "N/A";
  const nvrName = nvrData?.nvrName || "N/A";
  const imageBase = config.has("ImageView") ? config.get("ImageView") : "";
  const imageUrl = Image ? (Image.startsWith("http") ? Image : `${imageBase}${Image}`) : "";

  const lines = [
    `🚨 *Incident Alert*`,
    `*Type:* ${(incidentType || "").replace(/_/g, " ") || "N/A"}`,
    incidentName ? `*Name:* ${incidentName}` : null,
    `*Time:* ${formatIncidentTime(timeOfIncident, timezone)}`,
    severity ? `*Severity:* ${severity}` : null,
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
  } = incident;

  // MarkdownV2 requires escaping these chars in any text/value so that user
  // data (names, descriptions) can't break Telegram's parser.
  const escapeMdV2 = (v) =>
    String(v ?? "N/A").replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
  // Uppercase, then escape — used for the dynamic values.
  const up = (v) => escapeMdV2(String(v ?? "N/A").toUpperCase());
  const cameraName = channelData?.customName || channelData?.name || incident?.cameraId || "N/A";
  const nvrName = nvrData?.nvrName || "N/A";

  const lines = [
    `🚨 *INCIDENT ALERT*`,
    ``,
    `*Type:* ${up((incidentType || "").replace(/_/g, " "))}`,
    incidentName ? `*Name:* ${up(incidentName)}` : null,
    `*Time:* ${timeOfIncident ? up(formatIncidentTime(timeOfIncident, timezone)) : "N/A"}`,
    severity ? `*Severity:* ${up(severity)}` : null,
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
