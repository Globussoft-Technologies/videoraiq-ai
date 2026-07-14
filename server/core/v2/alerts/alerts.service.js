import Channel from "./../channels/channels.model.js";
import AppError from "../../../utils/appError.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import NVR from "../NVR/nvr.model.js";
import mongoose from "mongoose";
import adminModel from "./../admin/admin.model.js";
import AlertsConfig from "./../alerts/alerts.model.js";
import alertValidation from './alerts.validate.js';
import MailHelper from "./../../../mailService/mail.helper.js"
import RecipientModel from "../verifyRecipients/recipients.model.js";


class AlertService {


  async createAlert(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const isAdminExist = await adminModel.findOne({
        user_id: (data?.user_id).toString(),
        email: data?.user_email,
      });
  
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!."));
      }
  
      const {
        detectionTypes,
        emails = [],
        phoneNumbers = [],
        selectedNVRs = [],
        selectedCameras = []
      } = req.body;
  
      const alertData = req.body;
  
      const { value, error } = alertValidation.validateCreateAlert(alertData);
      if (error) {
        return res.send(Response.userFailResp('Validation Failed!.', error.message));
      }
  
      const { alertBasedOn } = req.query;
  
      // Validate alertBasedOn
      if (!['NVR', 'Camera'].includes(alertBasedOn)) {
        return res.send(Response.userFailResp('alertBasedOn must be either "NVR" or "Camera"', "Validation Failed!."));
      }
  
      // Validate NVRs
      if (alertBasedOn === 'NVR') {
        if (!selectedNVRs.length) {
          return res.send(Response.userFailResp('selectedNVRs must not be empty for NVR-based alerts', "Validation Failed!."));
        }
  
        const validNVRs = await NVR.find({ _id: { $in: selectedNVRs } }).select('_id');
        if (validNVRs.length !== selectedNVRs.length) {
          return res.send(Response.userFailResp('One or more NVR IDs are invalid', "Validation Failed!."));
        }
      }
  
      // Validate Cameras
      if (alertBasedOn === 'Camera') {
        if (!selectedCameras.length) {
          return res.send(Response.userFailResp('selectedCameras must not be empty for Camera-based alerts', "Validation Failed!."));
        }
  
        const validCameras = await Channel.find({ _id: { $in: selectedCameras } }).select('_id');
        if (validCameras.length !== selectedCameras.length) {
          return res.send(Response.userFailResp('One or more Camera IDs are invalid', "Validation Failed!."));
        }
      }
      const emailAddresses = emails.map(e => e.value);


      let missingEmailsData =[]
      // ✅ Validate emails
      if (emails.length) {
        const verifiedEmails = await RecipientModel.find({
          adminId: isAdminExist._id,
          type: 'email',
          verified: true,
          value: { $in: emailAddresses }
        }).select('value');
        const foundEmailValues = verifiedEmails.map(e => e.value);
        const missingEmails = emails.filter(e => !foundEmailValues.includes(e.value));
        missingEmailsData = missingEmails?.map(e => e.value);
        if (missingEmails?.length) {
          return res.send(Response.userFailResp(`Unverified or missing emails: ${missingEmailsData.join(', ')}`, "Validation Failed!."));
        }
      }
      let phoneNumbersList = phoneNumbers.map(p => p.value);
      
      // ✅ Validate phone numbers
      if (phoneNumbers?.length&&phoneNumbers[0]?.value!==null) {
        const verifiedPhones = await RecipientModel.find({
          adminId: isAdminExist._id,
          type: 'phone',
          verified: true,
          value: { $in: phoneNumbersList }
        }).select('value');
        
        const foundPhoneValues = verifiedPhones.map(p => p.value);
        const missingPhones = phoneNumbers.filter(p => !foundPhoneValues.includes(p.value));
        const phoneNumbersListData = missingPhones?.map(p => p.value);
  
        if (missingPhones?.length) {
          return res.send(Response.userFailResp(`Unverified or missing phone numbers: ${phoneNumbersListData.join(', ')}`, "Validation Failed!."));
        }
      }
      // Build alertData object dynamically
      const alerts = {
        adminId: isAdminExist._id,
        detectionTypes,
        alertBasedOn,
        selectedNVRs: alertBasedOn === 'NVR' ? selectedNVRs : [],
        selectedCameras: alertBasedOn === 'Camera' ? selectedCameras : []
      };

      // Only add emails if provided
      if (emails && Array.isArray(emails) && emails[0]?.value!==null && missingEmailsData.length===0) {
        alerts.emails = emailAddresses;
      }
      // Only add phoneNumbers if provided
      if (phoneNumbers && Array.isArray(phoneNumbers) && phoneNumbers[0]?.value!==null ) {
        alerts.phoneNumbers = phoneNumbersList;
      }
      // ✅ Save Alert
      const alert = new AlertsConfig(alerts);
      const saved = await alert.save();

  
  
      return res.status(200).json(
        Response.userSuccessResp('Alert created successfully', {
          alert: saved
        })
      );
  
    } catch (error) {
      next(new AppError(error, 500));
    }
  }
  

async updateAlert(req, res, next) {
  try {
    const data = req?.verified?.userData;

    let isAdminExist = await adminModel.findOne({
      user_id: (data?.user_id).toString(),
      email: data?.user_email,
    });

    let alertData = req.body;

    let {value,error} = alertValidation.validateCreateAlert(alertData);

    if (error) {
      return res.send(Response.userFailResp('Validation Failed!.',error.message));
    }
    if (!isAdminExist) {
      return res.send(Response.userFailResp("Admin not found!", "Validation Failed!."));
    }

    const {
      detectionTypes,
      emails = [],
      phoneNumbers = [],
      selectedNVRs = [],
      selectedCameras = [],
    } = req.body;

    const { alertBasedOn, alertId } = req.query;

    let isAlertExist = await AlertsConfig.findOne({_id:alertId, adminId: isAdminExist._id })

    if (!isAlertExist) {
      return res.send(Response.userFailResp("Alert not found!, Please provide valid AlertId", "Validation Failed!."));
    }

    // Validate alertBasedOn
    
    let finalNVRs = [...isAlertExist.selectedNVRs];
    const { addNVRs = [], removeNVRs = [], selectedNVRs: updateNVRs } = req.body;
    
    if (alertBasedOn === 'NVR') {
      if (updateNVRs && Array.isArray(updateNVRs)) {
        // Validate and replace full list
        const validNVRs = await NVR.find({ _id: { $in: updateNVRs } }).select('_id');
        const validNVRIds = validNVRs.map(nvr => nvr._id.toString());
    
        const invalidNVRs = updateNVRs.filter(id => !validNVRIds.includes(id));
        if (invalidNVRs.length) {
          return res.send(Response.userFailResp(`Invalid NVR IDs: ${invalidNVRs.join(', ')}`, "Validation Failed!"));
        }
    
        finalNVRs = validNVRIds; // replace completely
      } else {
        // Merge (add/remove)
        const allNVRsToCheck = [...addNVRs, ...removeNVRs];
        if (allNVRsToCheck.length) {
          const validNVRs = await NVR.find({ _id: { $in: allNVRsToCheck } }).select('_id');
          const validNVRIds = validNVRs.map(nvr => nvr._id.toString());
    
          const invalidNVRs = allNVRsToCheck.filter(id => !validNVRIds.includes(id));
          if (invalidNVRs.length) {
            return res.send(Response.userFailResp(`Invalid NVR IDs: ${invalidNVRs.join(', ')}`, "Validation Failed!"));
          }
        }
    
        finalNVRs = Array.from(new Set([...finalNVRs, ...addNVRs]));
        finalNVRs = finalNVRs.filter(id => !removeNVRs.includes(id));
      }
    }
    
    
    let finalCameras = [...isAlertExist.selectedCameras];
    const { addCameras = [], removeCameras = [], selectedCameras: updateCameras } = req.body;
    
    if (alertBasedOn === 'Camera') {
      if (updateCameras && Array.isArray(updateCameras)) {
        const validCams = await Channel.find({ _id: { $in: updateCameras } }).select('_id');
        const validCamIds = validCams.map(cam => cam._id.toString());
    
        const invalidCams = updateCameras.filter(id => !validCamIds.includes(id));
        if (invalidCams.length) {
          return res.send(Response.userFailResp(`Invalid Camera IDs: ${invalidCams.join(', ')}`, "Validation Failed!"));
        }
    
        finalCameras = validCamIds; // replace completely
      } else {
        const allCamsToCheck = [...addCameras, ...removeCameras];
        if (allCamsToCheck.length) {
          const validCams = await Channel.find({ _id: { $in: allCamsToCheck } }).select('_id');
          const validCamIds = validCams.map(cam => cam._id.toString());
    
          const invalidCams = allCamsToCheck.filter(id => !validCamIds.includes(id));
          if (invalidCams.length) {
            return res.send(Response.userFailResp(`Invalid Camera IDs: ${invalidCams.join(', ')}`, "Validation Failed!"));
          }
        }
    
        finalCameras = Array.from(new Set([...finalCameras, ...addCameras]));
        finalCameras = finalCameras.filter(id => !removeCameras.includes(id));
      }
    }
    
    


    const newDetectionTypes = detectionTypes || [];
    const removeDetectionTypes = req.body.removeDetectionTypes || [];
    let finalDetectionTypes = [...isAlertExist.detectionTypes];

    // Add new detection types (ensure no duplicates)
    if (newDetectionTypes?.length) {
      finalDetectionTypes = Array.from(new Set([...finalDetectionTypes, ...newDetectionTypes]));
    }

    // Remove specified detection types
    if (removeDetectionTypes.length) {
      finalDetectionTypes = finalDetectionTypes.filter(
        type => !removeDetectionTypes.includes(type)
      );
    }


    const emailAddresses = emails.map(e => e.value);
    let finalEmails = [...isAlertExist.emails];
    const removeEmails = req.body.removeEmails || [];

    if (emails.length && emailAddresses[0] !== null) {
      const verifiedEmails = await RecipientModel.find({
        adminId: isAdminExist._id,
        type: 'email',
        verified: true,
        value: { $in: emailAddresses }
      }).select('value');

      const foundEmailValues = verifiedEmails.map(e => e.value);
      const missingEmails = emailAddresses.filter(e => !foundEmailValues.includes(e));
      
      if (missingEmails.length) {
        return res.send(Response.userFailResp(`Unverified or missing emails: ${missingEmails.join(', ')}`, "Validation Failed!."));
      }

      // Merge without duplicates
      finalEmails = Array.from(new Set([...isAlertExist.emails, ...foundEmailValues]));
    }
    // Remove Emails if requested
    if (removeEmails.length) {
      finalEmails = finalEmails.filter(email => !removeEmails.includes(email));
    }


    const phoneNumbersList = phoneNumbers.map(p => p.value);
    let finalPhones = [...isAlertExist.phoneNumbers];
    const removePhones = req.body.removePhones || [];

    if (phoneNumbers?.length && phoneNumbersList[0] !== null) {
      const verifiedPhones = await RecipientModel.find({
        adminId: isAdminExist._id,
        type: 'phone',
        verified: true,
        value: { $in: phoneNumbersList }
      }).select('value');
      const foundPhoneValues = verifiedPhones.map(p => p?.value);
      const missingPhones = phoneNumbersList.filter(p => !foundPhoneValues.includes(p));
      
      if (missingPhones.length) {
        return res.send(Response.userFailResp(`Unverified or missing phone numbers: ${missingPhones.join(', ')}`, "Validation Failed!."));
      }

      // Merge without duplicates
      finalPhones = Array.from(new Set([...isAlertExist.phoneNumbers, ...foundPhoneValues]));
    }
    // Remove Phones if requested
    if (removePhones.length) {
      finalPhones = finalPhones.filter(phone => !removePhones.includes(phone));
    }



    const updatedAlert = await AlertsConfig.findOneAndUpdate(
      { _id: alertId, adminId: isAdminExist._id },
      {
        detectionTypes: finalDetectionTypes,
        emails: finalEmails,
        phoneNumbers: finalPhones,
        alertBasedOn,
        selectedNVRs: alertBasedOn === 'NVR' ? finalNVRs : [],
        selectedCameras: alertBasedOn === 'Camera' ? finalCameras : [],
      },
      { new: true }
    );

    if (!updatedAlert) {
      return res.send(Response.userFailResp("Alert not found or unauthorized update attempt", "Update Failed!."));
    }

    return res.status(200).json(
      Response.userSuccessResp('Alert updated successfully', {
        alert: updatedAlert
      })
    );
  } catch (error) {
    next(new AppError('Failed to update alert', 500));
  }
}


async fetchAllAlerts(req, res, next) {
  try {
    const data = req?.verified?.userData;

    let isAdminExist = await adminModel.findOne({
      user_id: (data?.user_id).toString(),
      email: data?.user_email,
    });
    if (!isAdminExist) {
      return res.send(Response.userFailResp("Admin not found!", "Validation Failed!."));
    }

    const { skip = 0, limit = 10 } = req.query;

    const filter = { adminId: isAdminExist._id };

    const [alerts, totalCount] = await Promise.all([
      AlertsConfig.find(filter)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit)),
      AlertsConfig.countDocuments(filter),
    ]);

    return res.status(200).json(
      Response.userSuccessResp('Fetched alerts successfully', {
        totalCount,
        alerts,
      })
    );
  } catch (error) {
    next(new AppError('Failed to fetch alerts', 500));
  }
}

async deleteAlerts(req, res, next) {
  try {
    const data = req?.verified?.userData;

    // Check if the admin exists
    const isAdminExist = await adminModel.findOne({
      user_id: data?.user_id?.toString(),
      email: data?.user_email,
    });

    if (!isAdminExist) {
      return res.send(Response.userFailResp("Admin not found!", "Validation Failed."));
    }

    const alertId = req.query.id;

    if (!alertId) {
      return res.send(Response.validationFailResp("Alert ID is required!", "Validation Failed."));
    }

    // Check if alert exists
    const isAlertExist = await AlertsConfig.findById(alertId);
    if (!isAlertExist) {
      return res.send(Response.validationFailResp("Alert does not exist!", "Validation Failed."));
    }

    // Delete the alert
    let alertDeleted = await AlertsConfig.deleteOne({ _id: alertId });

    return res.send(Response.userSuccessResp("Alert deleted successfully!", alertDeleted));
  } catch (error) {
    next(new AppError("Failed to delete alert", 500));
  }
}



}

export default new AlertService();
