import { incidentForEmail } from "../../../utils/detectionDisplayNames.js";
import AlertsConfig from '../alerts/alerts.model.js';
import MailResponse from '../../../mailService/mail.helper.js'
import { sendIncidentWhatsApp } from "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js";
import TelegramService from "../../../services/telegram.service.js";
import nvrModel from '../NVR/nvr.model.js';
import channelsModel from '../channels/channels.model.js';
import RecipientModel, { normalizeSeverity, selectedRecipientsQuery, subscribedRecipientsQuery } from '../verifyRecipients/recipients.model.js';
import { Incident } from '../incidents/incidents.model.js';
import adminModel from '../admin/admin.model.js';
import logger from '../../../utils/logger.js';
import {
  resolveTelegramZoneConfig,
  isIncidentWithinZoneWindow,
  resolvePreferredTelegramChatIds,
  resolveVehicleCheckInOutTelegramChatIds,
} from '../../../utils/telegramAlertRouting.js';


export const triggerAlertOnIncident = async ({detectionType, nvrId, channelId ,saved,adminId}) => {
  try {
    let channelData = await channelsModel.findOne({_id:channelId}).populate("profile").lean();
    let nvrData = await nvrModel.findOne({_id:nvrId});
    let incidentData = await Incident.findOne({_id:saved?._id}).populate('personDetected','firstName lastName email') // Select only necessary fields
    .lean();

    const populatePaths = Object.entries(channelData?.detections || {})
    .filter(([key, value]) => value && channelsModel.schema.path(`detections.${key}.id`)) // non-null refs the schema knows: one stray key (e.g. attendanceSettings) made populate throw and dropped every alert of the camera
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
    const adminTz = await adminModel.findById(adminId).select("timezone").lean()
      .then(a => a?.timezone || "Asia/Kolkata")
      .catch(() => "Asia/Kolkata");
    const adminFlags = await adminModel
      .findById(adminId)
      .select("emailAlertsEnabled telegramAlertsEnabled detectionDisplayNames")
      .lean()
      .catch(() => null);
    const resolveZoneThreshold = (zoneConfigs = [], incidentZone) => {
      const zoneName = String(incidentZone || "").trim().toLowerCase();
      if (!zoneName) return null;

      const matchedZone = (Array.isArray(zoneConfigs) ? zoneConfigs : []).find(
        (zoneConfig) => String(zoneConfig?.name || "").trim().toLowerCase() === zoneName,
      );

      const threshold = matchedZone?.threshold_sec;
      return Number.isFinite(Number(threshold)) ? Number(threshold) : null;
    };
    const zoneConfigs = matchedDetection?.id?.settings?.zone_configs || [];
    const loiteringThreshold = resolveZoneThreshold(zoneConfigs, incidentData?.zone || saved?.zone);
    if (detectionType === "loiteringDetection") {
      if (incidentData) incidentData.loiteringThreshold = loiteringThreshold;
      if (saved) saved.loiteringThreshold = loiteringThreshold;
    }
      // Step 4: Group alerts by recipientModel
      const groupedAlerts = matchedDetection?.id?.alerts
    // The incident's own severity, else its detection's level of importance.
    const alertSeverity = normalizeSeverity(incidentData?.severity ?? saved?.severity)
      || normalizeSeverity(matchedDetection?.id?.settings?.levelOfImportance);

        
    // Step 5: Fetch recipient data from respective models
    // ponytail: every channel below is guarded on its own — one provider being
    // down (e.g. SendGrid 401) must never block the others. Log and carry on.
    // No retry/queue; add one only if losing a failed alert becomes a problem.

    // Send Email
    try {
      // Selected on this detection, or subscribed to its type: see
      // selectedRecipientsQuery / subscribedRecipientsQuery.
      const [selectedRecipients, subscribedRecipients] = await Promise.all([
        RecipientModel.find(selectedRecipientsQuery({ ids: groupedAlerts, detectionType, severity: alertSeverity }))
          .select('value -_id')
          .lean(),
        RecipientModel.find(subscribedRecipientsQuery({ adminId: adminId, detectionType, severity: alertSeverity }))
          .select('value -_id')
          .lean(),
      ]);
      const emailAddresses = [...new Set([...selectedRecipients, ...subscribedRecipients].map(r => r.value))];

      // if (emailAddresses?.length && channelData?.profile?.notification?.channels?.email===true) {
      if(emailAddresses?.length && adminFlags?.emailAlertsEnabled !== false){
        const mailIncident = incidentForEmail(incidentData, adminFlags?.detectionDisplayNames, detectionType);
        if(detectionType==="loiteringWithoutAuth"){
          let mailResponse = await MailResponse.loiteringWithoutAuth(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType==="loiteringWithAuth"){
          let mailResponse = await MailResponse.LoiteringWithAuth(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType==="unauthorizedAccess"){
          let mailResponse = await MailResponse.unauthorizedAccess(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType==="lineCrossing"){
          let mailResponse = await MailResponse.LineCrossingAuth(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType==="motionDetection"){
          let mailResponse = await MailResponse.motionDetectionAuth(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType ==="genericObjectDetection"){
          let mailResponse = await MailResponse.genericObjectDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType==="countPersons"){
          let mailResponse = await MailResponse.countPersons(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        }else if(detectionType==="countVehicles"){
          let mailResponse = await MailResponse.countVehicles(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        } else if(detectionType==="crowdDetection"){
          let mailResponse = await MailResponse.crowdDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        } else if(detectionType==="personalProtectiveEquipment"){
          let mailResponse = await MailResponse.personalProtectiveEquipment(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz);
        } else if(detectionType==="lightDetection"){
          let mailResponse = await MailResponse.lightDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="doorDetection"){
          let mailResponse = await MailResponse.doorDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="bagDetection"){
          let mailResponse = await MailResponse.bagDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="vehicleDetection"){
          let mailResponse = await MailResponse.vehicleDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="carModelDetection"){
          let mailResponse = await MailResponse.carModelDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="deskAbsence"){
          let mailResponse = await MailResponse.deskAbsence(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="guardAbsence"){
          let mailResponse = await MailResponse.guardAbsence(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="guardSleepingDetection"){
          let mailResponse = await MailResponse.guardSleepingDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="conveyorDetection"){
          let mailResponse = await MailResponse.conveyorDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="crusherDetection"){
          let mailResponse = await MailResponse.crusherDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="waterSpillageDetection"){
          let mailResponse = await MailResponse.waterSpillageDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="fireSmokeDetection"){
          let mailResponse = await MailResponse.fireSmokeDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="personFallSickDetection"){
          let mailResponse = await MailResponse.personFallSickDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="vehicleObstruction"){
          let mailResponse = await MailResponse.vehicleObstruction(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="unauthorizedParkingDetection"){
          let mailResponse = await MailResponse.vehicleObstruction(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="vehicleTypeDetection"){
          let mailResponse = await MailResponse.vehicleTypeDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="loiteringDetection"){
          if (incidentData) incidentData.loiteringThreshold = loiteringThreshold;
          if (saved) saved.loiteringThreshold = loiteringThreshold;
          let mailResponse = await MailResponse.loiteringDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="tableOccupancyDetection"){
          let mailResponse = await MailResponse.tableOccupancyDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="foodServicePPEDetection"){
          let mailResponse = await MailResponse.foodServicePPEDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="uniformDetection"){
          await MailResponse.industrialDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        } else if(detectionType==="mobilePhoneDetection"){
          let mailResponse = await MailResponse.mobilePhoneDetection(emailAddresses,mailIncident,detectionType,nvrData,channelData,adminTz)
        }
      }
    } catch (err) {
      logger.error(`[ALERT_EMAIL_ERROR] Email alert failed`, {
        detectionType, channelId, nvrId, adminId, errorMessage: err.message,
      });
    }

    // Send WhatsApp alert (replaces SMS) to the same phone recipients.
    try {
      const smsRecipients = await RecipientModel.find(selectedRecipientsQuery({ ids: groupedAlerts, type: 'phone', detectionType, severity: alertSeverity }))
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

    // Telegram: send to every channel configured for this detection/zone.
    // Keep per-zone window support when it can be evaluated (both startTime
    // and endTime set on the matched zone), but don't silently drop alerts
    // just because the incident arrived without a reliable zone/time payload
    // or the zone has no schedule configured — default to open in that case.
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
      const vehicleChatIds = detectionType === "vehicleCheckInOut"
        ? resolveVehicleCheckInOutTelegramChatIds({
            incidentZone: telegramIncident?.zone || telegramIncident?.zoneName,
            detectionSettings,
            timeOfIncidentUTC: telegramIncident?.timeOfIncident,
            adminTimezone: adminTz,
          })
        : null;
      const preferredChatIds = vehicleChatIds ?? resolvePreferredTelegramChatIds({
        matchingZoneConfig,
        detectionSettings,
      });
      // Can Stack stores its optional schedule at detector level because it
      // deliberately has no polygon zones. Zone-based detectors continue to
      // use the matched zone schedule.
      const telegramWindowConfig = matchingZoneConfig || detectionSettings?.schedule;
      const hasEvaluableWindow =
        Boolean(telegramWindowConfig?.startTime) &&
        Boolean(telegramWindowConfig?.endTime) &&
        Boolean(telegramIncident?.timeOfIncident) &&
        Boolean(adminTz);
      const windowOpen = vehicleChatIds !== null ? vehicleChatIds.length > 0 : hasEvaluableWindow
        ? isIncidentWithinZoneWindow(
            telegramWindowConfig,
            telegramIncident?.timeOfIncident,
            adminTz,
          )
        : true;
      if (windowOpen && adminFlags?.telegramAlertsEnabled !== false) {
        await TelegramService.sendIncident(
          telegramIncident,
          nvrData,
          channelData,
          adminId,
          adminTz,
          { preferredChatIds },
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
