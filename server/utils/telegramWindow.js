import momentTZ from "moment-timezone";

// Parse a 12-hour clock string like "09:00 AM" / "6:30 PM" into minutes since
// midnight (0..1439). Returns null if it can't be parsed.
export const parseClockToMinutes = (str) => {
  if (!str || typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3].toUpperCase();
  if (hour < 1 || hour > 12 || min < 0 || min > 59) return null;
  if (mer === "AM") hour = hour === 12 ? 0 : hour;
  else hour = hour === 12 ? 12 : hour + 12; // PM
  return hour * 60 + min;
};

// Is `minutes` within the daily window [start, end]? Handles windows that cross
// midnight (e.g. 10:00 PM -> 06:00 AM). Inclusive of both bounds.
const inWindow = (minutes, start, end) => {
  if (start === end) return true; // full-day window
  if (start < end) return minutes >= start && minutes <= end; // same-day
  return minutes >= start || minutes <= end; // crosses midnight
};

// Decide whether a Telegram alert should be sent for this incident, based on
// per-zone time windows on the detection setting, evaluated in the admin's
// timezone. STRICT: only allowed when the incident's zone matches a zone_config
// that has BOTH startTime and endTime set, and the incident's local time falls
// inside that window. No matching window -> not allowed.
//
//   incidentZone      - incident.zone (string)
//   timeOfIncidentUTC - incident.timeOfIncident (UTC date/string)
//   zoneConfigs       - detectionSetting.settings.zone_configs array
//   adminTimezone     - IANA tz, e.g. "Asia/Kolkata"
export const isTelegramWindowOpen = ({ incidentZone, timeOfIncidentUTC, zoneConfigs, adminTimezone }) => {
  if (!adminTimezone) return false; // no tz -> can't evaluate a local window
  if (!Array.isArray(zoneConfigs) || zoneConfigs.length === 0) return false;
  if (!incidentZone) return false;

  const zc = zoneConfigs.find(
    (z) => String(z?.name).trim().toLowerCase() === String(incidentZone).trim().toLowerCase(),
  );
  if (!zc || !zc.startTime || !zc.endTime) return false;

  const start = parseClockToMinutes(zc.startTime);
  const end = parseClockToMinutes(zc.endTime);
  if (start === null || end === null) return false;

  const local = momentTZ.utc(timeOfIncidentUTC).tz(adminTimezone);
  if (!local.isValid()) return false;
  const nowMinutes = local.hours() * 60 + local.minutes();

  return inWindow(nowMinutes, start, end);
};
