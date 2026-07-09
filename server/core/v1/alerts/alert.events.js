import AlertsConfig from '../alerts/alerts.model.js';
import MailResponse from '../../../mailService/mail.helper.js'
import { sendIncidentWhatsApp } from "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js";
import TelegramService from "../../../services/telegram.service.js";
import nvrModel from '../NVR/nvr.model.js';
import channelsModel from '../channels/channels.model.js';
import RecipientModel from '../verifyRecipients/recipients.model.js';
import { Incident } from '../incidents/incidents.model.js';
import adminModel from '../admin/admin.model.js';
import { isTelegramWindowOpen } from '../../../utils/telegramWindow.js';
import logger from '../../../utils/logger.js';


export const triggerAlertOnIncident = async ({detectionType, nvrId, channelId ,saved,adminId}) => {
  try {
    let channelData = await channelsModel.findOne({_id:channelId}).populate("profile").lean();
    let nvrData = await nvrModel.findOne({_id:nvrId});
    let incidentData = await Incident.findOne({_id:saved?._id}).populate('personDetected','firstName lastName email') // Select only necessary fields
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
      // Step 4: Group alerts by recipientModel
      const groupedAlerts = matchedDetection?.id?.alerts

        
    // Step 5: Fetch recipient data from respective models
    const [emailRecipientsFromAlerts, emailRecipientsFromIncidentType] = await Promise.all([
      RecipientModel.find({ _id: { $in: channelData?.alerts }, type: 'email' })
        .select('value -_id')
        .lean(),
      RecipientModel.find({ adminId, type: 'email', incidentTypes: detectionType})
        .select('value -_id')
        .lean(),
    ]);

    const emailAddresses = [
      ...new Set([
        ...emailRecipientsFromAlerts.map(r => r.value),
        ...emailRecipientsFromIncidentType.map(r => r.value),
      ])
    ];
    
    // Send Email
      // if (emailAddresses?.length && channelData?.profile?.notification?.channels?.email===true) {
      if(emailAddresses?.length){
        if(detectionType==="loiteringWithoutAuth"){
          let mailResponse = await MailResponse.loiteringWithoutAuth(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType==="loiteringWithAuth"){
          let mailResponse = await MailResponse.LoiteringWithAuth(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType==="unauthorizedAccess"){
          let mailResponse = await MailResponse.unauthorizedAccess(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType==="lineCrossing"){
          let mailResponse = await MailResponse.LineCrossingAuth(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType==="motionDetection"){
          let mailResponse = await MailResponse.motionDetectionAuth(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType ==="genericObjectDetection"){
          let mailResponse = await MailResponse.genericObjectDetection(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType==="countPersons"){
          let mailResponse = await MailResponse.countPersons(emailAddresses,incidentData,detectionType,nvrData,channelData);
        }else if(detectionType==="countVehicles"){
          let mailResponse = await MailResponse.countVehicles(emailAddresses,incidentData,detectionType,nvrData,channelData);
        } else if(detectionType==="crowdDetection"){
          let mailResponse = await MailResponse.crowdDetection(emailAddresses,incidentData,detectionType,nvrData,channelData);
        } else if(detectionType==="personalProtectiveEquipment"){
          let mailResponse = await MailResponse.personalProtectiveEquipment(emailAddresses,incidentData,detectionType,nvrData,channelData);
        } else if(detectionType==="lightDetection"){
          let mailResponse = await MailResponse.lightDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="doorDetection"){
          let mailResponse = await MailResponse.doorDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="bagDetection"){
          let mailResponse = await MailResponse.bagDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="vehicleDetection"){
          let mailResponse = await MailResponse.vehicleDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="deskAbsence"){
          let mailResponse = await MailResponse.deskAbsence(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="guardAbsence"){
          let mailResponse = await MailResponse.guardAbsence(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="conveyorDetection"){
          let mailResponse = await MailResponse.conveyorDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="crusherDetection"){
          let mailResponse = await MailResponse.crusherDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="waterSpillageDetection"){
          let mailResponse = await MailResponse.waterSpillageDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="vehicleObstruction"){
          let mailResponse = await MailResponse.vehicleObstruction(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="vehicleTypeDetection"){
          let mailResponse = await MailResponse.vehicleTypeDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="loiteringDetection"){
          let mailResponse = await MailResponse.loiteringDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="tableOccupancyDetection"){
          let mailResponse = await MailResponse.tableOccupancyDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="foodServicePPEDetection"){
          let mailResponse = await MailResponse.foodServicePPEDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        } else if(detectionType==="mobilePhoneDetection"){
          let mailResponse = await MailResponse.mobilePhoneDetection(emailAddresses,incidentData,detectionType,nvrData,channelData)
        }
    }
    const smsRecipients = await RecipientModel.find({ _id: { $in: groupedAlerts} ,type:'phone'})
          .select('value -_id')
          .lean();

    const phoneNumbers = smsRecipients.map(recipient => recipient.value);
      // Send WhatsApp alert (replaces SMS) to the same phone recipients.
    if (phoneNumbers?.length) {
        await sendIncidentWhatsApp(incidentData || saved, phoneNumbers, nvrData, channelData);
    }

    // Telegram: send to the admin's channel ONLY if the incident's zone has a
    // per-zone time window on this detection setting AND the incident's local
    // time (UTC -> admin's timezone) falls inside it. No matching window -> skip.
    const telegramIncident = incidentData || saved;
    const adminTz = (await adminModel.findById(adminId).select("timezone").lean())?.timezone;
    const zoneConfigs = matchedDetection?.id?.settings?.zone_configs || [];
    const windowOpen = isTelegramWindowOpen({
      incidentZone: telegramIncident?.zone,
      timeOfIncidentUTC: telegramIncident?.timeOfIncident,
      zoneConfigs,
      adminTimezone: adminTz,
    });
    if (windowOpen) {
      await TelegramService.sendIncident(telegramIncident, nvrData, channelData, adminId);
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
