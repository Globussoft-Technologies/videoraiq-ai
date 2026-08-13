import momentTZ from "moment-timezone";
import { parseClockToMinutes } from "./telegramWindow.js";

// Shared Telegram alert-routing logic used by BOTH core/v1/alerts/alert.events.js
// and core/v2/alerts/alert.events.js. It decides which Telegram channel(s) get
// notified for an incident and whether the per-zone time window is open.
// Single source of truth so the two API versions can never drift out of sync
// again — whichever one actually receives the incident (see INCIDENT_LOG_API
// on the detection engine), the routing behaves identically.

export const findMatchingZoneConfig = (incidentZone, zoneConfigs = []) => {
  if (!incidentZone || !Array.isArray(zoneConfigs)) return null;

  return (
    zoneConfigs.find(
      (zone) =>
        String(zone?.name || "").trim().toLowerCase() ===
        String(incidentZone || "").trim().toLowerCase(),
    ) || null
  );
};

// Is the incident's local time (UTC -> admin's timezone) inside the zone's
// configured [startTime, endTime] window? Handles windows that cross midnight.
export const isIncidentWithinZoneWindow = (zoneConfig, timeOfIncidentUTC, adminTimezone) => {
  if (!zoneConfig || !adminTimezone || !timeOfIncidentUTC) return false;
  if (!zoneConfig.startTime || !zoneConfig.endTime) return false;

  const start = parseClockToMinutes(zoneConfig.startTime);
  const end = parseClockToMinutes(zoneConfig.endTime);
  if (start === null || end === null) return false;

  const local = momentTZ.utc(timeOfIncidentUTC).tz(adminTimezone);
  if (!local.isValid()) return false;
  const incidentMinutes = local.hours() * 60 + local.minutes();

  if (start === end) return true;
  if (start < end) return incidentMinutes >= start && incidentMinutes <= end;
  return incidentMinutes >= start || incidentMinutes <= end;
};

export const resolveTelegramZoneConfig = ({
  incidentZone,
  zoneConfigs = [],
  timeOfIncidentUTC,
  adminTimezone,
}) => {
  if (!Array.isArray(zoneConfigs) || zoneConfigs.length === 0) return null;
  const exactMatch = findMatchingZoneConfig(incidentZone, zoneConfigs);
  if (exactMatch) return exactMatch;

  // Preserve the old "default channel" behavior for single-zone detections:
  // if only one zone exists, use it even when the incident carries a different
  // zone label (or no label at all).
  if (zoneConfigs.length === 1) return zoneConfigs[0];

  // When multiple zones exist, fall back to the first zone whose configured
  // Telegram window is open for this incident. This preserves alert delivery
  // for detections that emit a generic/mismatched zone label while still
  // respecting the per-zone schedule and preferred Telegram channel.
  return (
    zoneConfigs.find((zoneConfig) =>
      isIncidentWithinZoneWindow(zoneConfig, timeOfIncidentUTC, adminTimezone),
    ) || null
  );
};

export const resolvePreferredTelegramChatIds = ({
  matchingZoneConfig,
  detectionSettings,
}) => {
  const topLevelCandidates = [
    ...(Array.isArray(detectionSettings?.telegramChatIds)
      ? detectionSettings.telegramChatIds
      : []),
  ]
    .map((chatId) => String(chatId || "").trim())
    .filter(Boolean);

  const zoneConfigsCount = Array.isArray(detectionSettings?.zone_configs)
    ? detectionSettings.zone_configs.length
    : 0;

  const zoneLevelArrayCandidates = [
    ...(Array.isArray(matchingZoneConfig?.telegramChatIds)
      ? matchingZoneConfig.telegramChatIds
      : []),
  ]
    .map((chatId) => String(chatId || "").trim())
    .filter(Boolean);

  if (zoneLevelArrayCandidates.length) {
    const zoneLevelCandidates = [
      ...zoneLevelArrayCandidates,
      matchingZoneConfig?.telegramChatId,
    ]
      .map((chatId) => String(chatId || "").trim())
      .filter(Boolean);

    // Single-zone detections store the full multi-select at the top level too.
    // If the zone payload lags behind and still contains only the legacy first
    // chat id, merge it with the top-level selection so alerts fan out to every
    // selected channel instead of collapsing back to one.
    if (zoneConfigsCount <= 1 && topLevelCandidates.length) {
      return [...new Set([...topLevelCandidates, ...zoneLevelCandidates])];
    }

    return [...new Set(zoneLevelCandidates)];
  }

  const legacyZoneChatId = String(matchingZoneConfig?.telegramChatId || "").trim();
  const legacyDetectionChatId = String(detectionSettings?.telegramChatId || "").trim();

  // Multi-channel support stores the full selection in telegramChatIds while
  // telegramChatId remains the first selected value for backward compatibility.
  // If a single-zone detection still reaches us with only the legacy zone-level
  // chat id populated, prefer the top-level array so alerts fan out to every
  // selected channel instead of collapsing back to one.
  if (!zoneLevelArrayCandidates.length && legacyZoneChatId && zoneConfigsCount <= 1) {
    const preferredFromTopLevel = topLevelCandidates.length
      ? topLevelCandidates
      : [legacyZoneChatId].filter(Boolean);

    return [...new Set(preferredFromTopLevel)];
  }

  const candidates = [
    ...topLevelCandidates,
    legacyZoneChatId,
    legacyDetectionChatId,
  ];

  return [
    ...new Set(
      candidates
        .map((chatId) => String(chatId || "").trim())
        .filter(Boolean),
    ),
  ];
};
