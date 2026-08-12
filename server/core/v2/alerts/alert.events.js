import AlertsConfig from '../alerts/alerts.model.js';
import MailResponse from '../../../mailService/mail.helper.js'
import { sendIncidentWhatsApp } from "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js";
import TelegramService from "../../../services/telegram.service.js";
import nvrModel from '../NVR/nvr.model.js';
import channelsModel from '../channels/channels.model.js';
import RecipientModel from '../verifyRecipients/recipients.model.js';
import { Incident } from '../incidents/incidents.model.js';
import adminModel from '../admin/admin.model.js';
import { parseClockToMinutes } from '../../../utils/telegramWindow.js';
import logger from '../../../utils/logger.js';
import momentTZ from "moment-timezone";

const buildAdminQuery = (adminId) => {
  if (!adminId) return null;
  const normalized = String(adminId).trim();
  if (!normalized) return null;

  return /^[a-f\d]{24}$/i.test(normalized)
    ? { _id: normalized }
    : { user_id: normalized };
};

const getAlertAdminContext = async (adminId) => {
  const query = buildAdminQuery(adminId);
  if (!query) {
    return {
      adminObjectId: null,
      timezone: "Asia/Kolkata",
      emailAlertsEnabled: true,
      telegramAlertsEnabled: true,
    };
  }

  const admin = await adminModel
    .findOne(query)
    .select("_id timezone emailAlertsEnabled telegramAlertsEnabled")
    .lean();

  return {
    adminObjectId: admin?._id ? String(admin._id) : null,
    timezone: admin?.timezone || "Asia/Kolkata",
    emailAlertsEnabled: admin?.emailAlertsEnabled,
    telegramAlertsEnabled: admin?.telegramAlertsEnabled,
  };
};

const findMatchingZoneConfig = (incidentZone, zoneConfigs = []) => {
  if (!incidentZone || !Array.isArray(zoneConfigs)) return null;

  return (
    zoneConfigs.find(
      zone =>
        String(zone?.name || '').trim().toLowerCase() ===
        String(incidentZone || '').trim().toLowerCase(),
    ) || null
  );
};

const isIncidentWithinZoneWindow = (zoneConfig, timeOfIncidentUTC, adminTimezone) => {
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

const resolveTelegramZoneConfig = ({
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

const resolvePreferredTelegramChatIds = ({
  matchingZoneConfig,
  detectionSettings,
}) => {
  const candidates = [
    matchingZoneConfig?.telegramChatId,
    detectionSettings?.telegramChatId,
  ];

  return [
    ...new Set(
      candidates
        .map((chatId) => String(chatId || "").trim())
        .filter(Boolean),
    ),
  ];
};

export const triggerAlertOnIncident = async ({ detectionType, nvrId, channelId, saved, adminId }) => {
  try {
    let channelData = await channelsModel.findOne({ _id: channelId }).populate("profile").lean();
    let nvrData = await nvrModel.findOne({ _id: nvrId });
    let incidentData = await Incident.findOne({ _id: saved?._id }).populate('personDetected', 'firstName lastName email') // Select only necessary fields
      .lean();

    const populatePaths = Object.entries(channelData?.detections || {})
      .filter(([_, value]) => value) // Only include non-null ObjectId refs
      .map(([key]) => ({ path: `detections.${key}.id` }));


    const channel = await channelsModel
      .findOne({ _id: channelId })
      .populate(populatePaths).lean();



    if (!channel || !channel.detections) {
      console.warn('Channel or detections not found for alert trigger', { channelId });
      return;
    }
    // Step 3: Find matching detection config based on detectionType
    const matchedDetection = Object.entries(channel.detections).find(
      ([key]) => key === `${detectionType}Settings`
    )?.[1];


    if (!matchedDetection) {
      console.warn(`No detection config found for type: ${detectionType}`, { detectionType, channelId });
      return;
    }

    // Alerts (mail / WhatsApp / Telegram) should show the detection setting's
    // name — what the user configured in the frontend — not the raw
    // incidentName. Override incidentName on the objects passed to the builders.
    const detectionSettingName = matchedDetection?.id?.name;
    if (detectionSettingName) {
      if (incidentData) incidentData.incidentName = detectionSettingName;
      if (saved) saved.incidentName = detectionSettingName;
    }
    const alertAdminContext = await getAlertAdminContext(adminId);
    const resolvedAdminId = alertAdminContext.adminObjectId || adminId;
    const adminTz = alertAdminContext.timezone;
    const resolveZoneThreshold = (zoneConfigs = [], incidentZone) => {
      const zoneName = String(incidentZone || "").trim().toLowerCase();
      if (!zoneName) return null;

      const matchedZone = (Array.isArray(zoneConfigs) ? zoneConfigs : []).find(
        (zoneConfig) => String(zoneConfig?.name || "").trim().toLowerCase() === zoneName,
      );

      const threshold = matchedZone?.threshold_sec;
      return Number.isFinite(Number(threshold)) ? Number(threshold) : null;
    };
    const detectionZoneConfigs = matchedDetection?.id?.settings?.zone_configs || [];
    const incidentZoneName = incidentData?.zone || incidentData?.zoneName || saved?.zone || saved?.zoneName;
    const loiteringThreshold = resolveZoneThreshold(detectionZoneConfigs, incidentZoneName);
    // Step 4: Group alerts by recipientModel
    const groupedAlerts = matchedDetection?.id?.alerts


    // Step 5: Fetch recipient data from respective models
    // ponytail: every channel below is guarded on its own — one provider being
    // down (e.g. SendGrid 401) must never block the others. Log and carry on.
    // No retry/queue; add one only if losing a failed alert becomes a problem.

    // Send Email
    try {
      const [emailRecipientsFromAlerts, emailRecipientsFromIncidentType] = await Promise.all([
        RecipientModel.find({ _id: { $in: groupedAlerts }, type: 'email' })
          .select('value -_id')
          .lean(),
        RecipientModel.find({ adminId: resolvedAdminId, type: 'email', incidentTypes: detectionType })
          .select('value -_id')
          .lean(),
      ]);

      const emailAddresses = [
        ...new Set([
          ...emailRecipientsFromAlerts.map(r => r.value),
          ...emailRecipientsFromIncidentType.map(r => r.value),
        ])
      ];

      // if (emailAddresses?.length && channelData?.profile?.notification?.channels?.email===true) {
      if (emailAddresses?.length && alertAdminContext?.emailAlertsEnabled !== false) {
        if (detectionType === "loiteringWithoutAuth") {
          let mailResponse = await MailResponse.loiteringWithoutAuth(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "loiteringWithAuth") {
          let mailResponse = await MailResponse.LoiteringWithAuth(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "unauthorizedAccess") {
          let mailResponse = await MailResponse.unauthorizedAccess(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "lineCrossing") {
          let mailResponse = await MailResponse.LineCrossingAuth(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "motionDetection") {
          let mailResponse = await MailResponse.motionDetectionAuth(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "genericObjectDetection") {
          let mailResponse = await MailResponse.genericObjectDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "countPersons") {
          let mailResponse = await MailResponse.countPersons(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "countVehicles") {
          let mailResponse = await MailResponse.countVehicles(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "crowdDetection") {
          let mailResponse = await MailResponse.crowdDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "personalProtectiveEquipment") {
          let mailResponse = await MailResponse.personalProtectiveEquipment(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz);
        } else if (detectionType === "lightDetection") {
          let mailResponse = await MailResponse.lightDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "doorDetection") {
          let mailResponse = await MailResponse.doorDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "bagDetection") {
          let mailResponse = await MailResponse.bagDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "vehicleDetection") {
          let mailResponse = await MailResponse.vehicleDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "deskAbsence") {
          let mailResponse = await MailResponse.deskAbsence(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "guardAbsence") {
          let mailResponse = await MailResponse.guardAbsence(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "conveyorDetection") {
          let mailResponse = await MailResponse.conveyorDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "crusherDetection") {
          let mailResponse = await MailResponse.crusherDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "waterSpillageDetection") {
          let mailResponse = await MailResponse.waterSpillageDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "vehicleObstruction") {
          let mailResponse = await MailResponse.vehicleObstruction(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "vehicleTypeDetection") {
          let mailResponse = await MailResponse.vehicleTypeDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "loiteringDetection") {
          if (incidentData) incidentData.loiteringThreshold = loiteringThreshold;
          if (saved) saved.loiteringThreshold = loiteringThreshold;
          let mailResponse = await MailResponse.loiteringDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "tableOccupancyDetection") {
          let mailResponse = await MailResponse.tableOccupancyDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "foodServicePPEDetection") {
          let mailResponse = await MailResponse.foodServicePPEDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        } else if (detectionType === "mobilePhoneDetection") {
          let mailResponse = await MailResponse.mobilePhoneDetection(emailAddresses, incidentData, detectionType, nvrData, channelData, adminTz)
        }
      }
    } catch (err) {
      logger.error(`[ALERT_EMAIL_ERROR] Email alert failed`, {
        detectionType, channelId, nvrId, adminId, errorMessage: err.message,
      });
    }

    // Send WhatsApp alert (replaces SMS) to the same phone recipients.
    try {
      const smsRecipients = await RecipientModel.find({ _id: { $in: groupedAlerts }, type: 'phone' })
        .select('value -_id')
        .lean();

      const phoneNumbers = smsRecipients.map(recipient => recipient.value);
      if (phoneNumbers?.length) {
        await sendIncidentWhatsApp(incidentData || saved, phoneNumbers, nvrData, channelData, adminTz);
      }
    } catch (err) {
      logger.error(`[ALERT_WHATSAPP_ERROR] WhatsApp alert failed`, {
        detectionType, channelId, nvrId, adminId, errorMessage: err.message,
      });
    }

    // Telegram: send to the admin's channel ONLY if the incident's zone has a
    // preferred Telegram channel configured. Keep per-zone window support when
    // it can be evaluated, but do not silently drop alerts when the incident
    // arrives without a reliable zone/time payload. In those cases, fall back
    // to the saved detection/zone channel so Telegram keeps behaving like the
    // earlier default-channel flow.
    try {
      const telegramIncident = incidentData || saved;
      const detectionSettings = matchedDetection?.id?.settings || {};
      const zoneConfigs = detectionSettings?.zone_configs || [];
      const matchingZoneConfig = resolveTelegramZoneConfig({
        incidentZone: telegramIncident?.zone || telegramIncident?.zoneName,
        zoneConfigs,
        timeOfIncidentUTC: telegramIncident?.timeOfIncident,
        adminTimezone: adminTz,
      });
      const preferredChatIds = resolvePreferredTelegramChatIds({
        matchingZoneConfig,
        detectionSettings,
      });
      const hasEvaluableWindow =
        Boolean(matchingZoneConfig?.startTime) &&
        Boolean(matchingZoneConfig?.endTime) &&
        Boolean(telegramIncident?.timeOfIncident) &&
        Boolean(adminTz);
      const windowOpen = hasEvaluableWindow
        ? isIncidentWithinZoneWindow(
          matchingZoneConfig,
          telegramIncident?.timeOfIncident,
          adminTz,
        )
        : true;

      if (alertAdminContext?.telegramAlertsEnabled !== false && windowOpen) {
        await TelegramService.sendIncident(
          telegramIncident,
          nvrData,
          channelData,
          resolvedAdminId,
          adminTz,
          {
            preferredChatIds,
          },
        );
      }
    } catch (err) {
      logger.error(`[ALERT_TELEGRAM_ERROR] Telegram alert failed`, {
        detectionType, channelId, nvrId, adminId, errorMessage: err.message,
      });
    }
  } catch (err) {
    logger.error(`[ALERT_TRIGGER_ERROR] Failed to trigger alert`, {
      detectionType,
      channelId,
      nvrId,
      adminId,
      errorMessage: err.message,
      errorStack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
};
