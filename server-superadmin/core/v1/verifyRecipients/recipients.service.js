
import AppError from "../../../utils/appError.js";
import Response from "../../../utils/response.js";
import adminModel from "./../admin/admin.model.js";
import RecipientModel from "./recipients.model.js";
import recipientValidation from './recipients.validate.js';
import mailHelper from "../../../mailService/mail.helper.js";
import {generateToken} from "../../../utils/cryptoUtils.js";
import { buildVerificationLinkMessage } from "../../../messagingService/message.helper.js";
import alertModel from "../alerts/alerts.model.js"
import { sendVerificationSMS } from "../../../messagingService/IncidentsSMSFunction/sms.incidentsFunction.js";
import { DetectionSetting } from "../detectionSettings/detectionSettings.model.js";

class AlertService {
    async createRecipients(req, res, next) {
        try {
          const data = req?.verified?.userData;
      
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId
          });

          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          const { alertType } = req.query; // 'email' or 'phoneNumber'
          const recipientsData = req.body;
      
          // Validate input
          const { value, error } = recipientValidation.createRecipient(recipientsData);
          if (error) {
            return res.send(Response.userFailResp('Validation Failed!', error.message));
          }
      
          let recipientData = {};
          let token = generateToken();
          
          if (alertType === 'email' && value?.email) {
            // Check for duplicate
            const existing = await RecipientModel.findOne({
              adminId: isAdminExist._id,
              type: 'email',
              value: value.email,
            });
            let verificationLink = `?token=${token}&value=${value.email}`
      
            if (existing) {
              return res.send(Response.userFailResp('Email already exists for this admin.', 'Duplicate Entry'));
            }
      
            recipientData = {
              adminId: isAdminExist._id,
              type: 'email',
              fullName:value?.fullName,
              value: value.email,
              verifyOTP:token,
              otpExpireDate: new Date(Date.now() + 10 * 60 * 1000),
              verified: false,
              incidentTypes: value?.incidentTypes || [],
            };
            mailHelper.verifyEmail(value?.email,verificationLink);
      
          } else if (alertType === 'phoneNumber' && value?.phoneNumber) {
            // Check for duplicate
            const existing = await RecipientModel.findOne({
              adminId: isAdminExist._id,
              type: 'phone',
              value: value?.phoneNumber,
            });
      
            if (existing) {
              return res.send(Response.userFailResp('Phone number already exists for this admin.', 'Duplicate Entry'));
            }
      
            let verificationLink = `?token=${token}&value=${value.phoneNumber}`
            recipientData = {
              adminId: isAdminExist._id,
              type: 'phone',
              fullName:value?.fullName,
              value: value.phoneNumber,
              verifyOTP:token,
              otpExpireDate: new Date(Date.now() + 10 * 60 * 1000),
              verified: false,
              incidentTypes: value?.incidentTypes || [],
            };
            sendVerificationSMS(verificationLink,value?.phoneNumber)
      
          } else {
            return res.send(Response.userFailResp("Invalid alertType or missing value. Must provide email or phoneNumber."));
          }
      
          let savedRecipient = await RecipientModel.create(recipientData);
          return res.send(Response.userSuccessResp(`A Verification Link has been sent to your ${alertType}. Please enter it to verify.`,savedRecipient));
        } catch (error) {
          next(new AppError(error.message || 'Failed to create recipient', 500));
        }
      }


      async verify(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const { otp, alertType } = req.query;
          const recipientsData = req.body;
      
          if (!otp || !alertType) {
            return res.send(Response.userFailResp("Missing token or alertType in query.", "Validation Failed!"));
          }
      
          // const isAdminExist = await adminModel.findOne({
          //   user_id: data?.user_id.toString(),
          //   email: data?.user_email,
          // });
      
          // if (!isAdminExist) {
          //   return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          // }
      
          // Validate input
          const { value, error } = recipientValidation.createRecipient(recipientsData);
          if (error) {
            return res.send(Response.userFailResp("Validation Failed!", error.message));
          }
      
          let recipientQuery = {
            // adminId: isAdminExist._id,
            verifyOTP: otp,
            type: alertType === 'email' ? 'email' : 'phone',
          };
      
          if (alertType === 'email' && value?.email) {
            recipientQuery.value = value.email;
          } else if (alertType === 'phoneNumber' && value?.phoneNumber) {
            recipientQuery.value = value.phoneNumber;
          } else {
            return res.send(Response.userFailResp("Invalid alertType or value in body.", "Validation Failed!"));
          }
      
          const recipient = await RecipientModel.findOne(recipientQuery);
          if (!recipient) {
            return res.send(Response.userFailResp("Invalid Token or recipient not found."));
          }
      
          if (new Date() > recipient.otpExpireDate) {
            return res.send(Response.userFailResp("Token has expired."));
          }
      
          recipient.verified = true;
          recipient.verifyOTP = undefined;
          recipient.otpExpireDate = undefined;
      
          await recipient.save();
      
          return res.send(Response.userSuccessResp("Recipient verified successfully.",recipient));
        } catch (error) {
          next(new AppError(error.message || "Failed to verify recipient", 500));
        }
      }

      async resendMailOrSMS(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const { id, alertType } = req.query;
          const recipientsData = req.body;
      
          if (!id || !alertType) {
            return res.send(
              Response.userFailResp("Missing recipient ID or alertType in query.", "Validation Failed!")
            );
          }
      
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Validate input
          const { value, error } = recipientValidation.recentRecipient(recipientsData);
          if (error) {
            return res.send(Response.userFailResp("Validation Failed!", error.message));
          }
          
          let isRecipientExist = await RecipientModel.findOne({ _id: id });
          if (!isRecipientExist) return res.send(Response.errorResp("Recipient not found.", "Validation failed!"));
          
          let isNotVerifiedRecipient = await RecipientModel.findOne({ _id: id ,verified:false});
          if (!isNotVerifiedRecipient) return res.send(Response.errorResp("Recipient is already verified.", "Validation failed!"));
      
          let recipientData = {};
          let token = generateToken();
      
          if (alertType === 'email' && value?.email) {
            let verificationLink = `?token=${token}&value=${value.email}`;
      
            recipientData = {
              adminId: isAdminExist._id,
              type: 'email',
              fullName: value?.fullName,
              value: value.email,
              verifyOTP: token,
              otpExpireDate: new Date(Date.now() + 10 * 60 * 1000),
              verified: false,
            };
      
            await mailHelper.verifyEmail(value?.email, verificationLink);
      
          } else if (alertType === 'phoneNumber' && value?.phoneNumber) {
            let verificationLink = `?token=${token}&value=${value.phoneNumber}`;
      
            recipientData = {
              adminId: isAdminExist._id,
              type: 'phone',
              fullName: value?.fullName,
              value: value.phoneNumber,
              verifyOTP: token,
              otpExpireDate: new Date(Date.now() + 10 * 60 * 1000),
              verified: false,
            };
      
            await sendVerificationSMS(verificationLink, value?.phoneNumber);
      
          } else {
            return res.send(
              Response.userFailResp("Invalid alertType or missing value. Must provide email or phoneNumber.")
            );
          }
      
          // Update recipient record with new OTP info
          let savedRecipient = await RecipientModel.updateOne(
            { _id: id },
            {
              $set: {
                ...recipientData,
                updatedAt: new Date(),
              }
            }
          );
      
          return res.send(Response.userSuccessResp(`A Verification Link has been sent to your ${alertType}. Please enter it to verify.`,savedRecipient));
      
        } catch (error) {
          next(new AppError(error.message || "Failed to verify recipient", 500));
        }
      }
      
      
      async fetchRecipients(req, res, next) {
        try {
          const data = req?.verified?.userData;
      
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId
          });

          const sortBy = {};
          sortBy[req.query.orderBy || 'createdAt'] = req.query.sort === 'asc' ? 1 : -1;
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!."));
          }
      
          const { skip = 0, limit = 10, alertType, filterByStatus, search } = req.query;

          const filter = { adminId: isAdminExist._id };
          
          if (alertType === 'email' || alertType === 'phone') {
            filter.type = alertType;
          }
          
          if (filterByStatus === 'verified') {
            filter.verified = true;
          } else if (filterByStatus === 'unverified') {
            filter.verified = false;
          }

          function escapeRegex(input = '') {
            return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escapes special regex characters
          }
          
          if (search) {
            let escapedSearch = escapeRegex(search);
            filter.$or = [
              { fullName: { $regex: escapedSearch, $options: 'i' } },
              { value: { $regex: escapedSearch, $options: 'i' } },
            ];
          }
      
          const [alerts, totalCount] = await Promise.all([
            RecipientModel.find(filter)
              .sort(sortBy)
              .skip(parseInt(skip))
              .limit(parseInt(limit)),
            RecipientModel.countDocuments(filter),
          ]);

          const updatedAlerts = await Promise.all(
            alerts.map(async (alert) => {
              const count = await DetectionSetting.countDocuments({
                alerts: alert._id,
              });
          
              return {
                ...alert.toObject(),
                detectionCount: count > 0 ? count : 0,
              };
            })
          );

      
          return res.status(200).json(
            Response.userSuccessResp('Fetched Recipients successfully', {
              totalCount,
              alerts:updatedAlerts,
            })
          );
        } catch (error) {
          next(new AppError('Failed to fetch Recipients', 500));
        }
      }
      
      async deleteRecipients(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const { emailToRemove, phoneToRemove } = req.body;
      
          // Validate input
          if (!emailToRemove && !phoneToRemove) {
            return res
              .status(400)
              .json(Response.userFailResp("Please provide either an email or phone number to remove"));
          }
      
          // Verify admin
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          const adminId = isAdminExist._id;
      
          // Check and delete from RecipientModel
          let deletedRecipient = null;
          if (emailToRemove) {
            const emailRecipient = await RecipientModel.findOne({
              adminId,
              type: 'email',
              value: emailToRemove,
            });
      
            if (!emailRecipient) {
              return res.status(404).json(Response.userFailResp("Email recipient not found"));
            }
      
            deletedRecipient = await RecipientModel.findOneAndDelete({
              adminId,
              type: 'email',
              value: emailToRemove,
            });
      
            // Also remove from AlertsConfig
            await alertModel.findOneAndUpdate(
              { adminId },
              { $pull: { emails: emailToRemove } }
            );
          }
      
          if (phoneToRemove) {
            const phoneRecipient = await RecipientModel.findOne({
              adminId,
              type: 'phone',
              value: phoneToRemove,
            });
      
            if (!phoneRecipient) {
              return res.status(404).json(Response.userFailResp("Phone recipient not found"));
            }
      
            deletedRecipient = await RecipientModel.findOneAndDelete({
              adminId,
              type: 'phone',
              value: phoneToRemove,
            });
      
            // Also remove from AlertsConfig
            await alertModel.findOneAndUpdate(
              { adminId },
              { $pull: { phoneNumbers: phoneToRemove } }
            );
          }
      
          return res.status(200).json(
            Response.userSuccessResp('Recipient deleted successfully', {
              deletedRecipient
            })
          );
      
        } catch (error) {
          next(new AppError('Failed to delete recipient', 500));
        }
      }
      
      

      async updateRecipient(req, res, next) {
        try {
          const data = req?.verified?.userData;
          const { id } = req.query;

          if (!id) {
            return res.send(Response.userFailResp("Missing recipient ID in query.", "Validation Failed!"));
          }

          const isAdminExist = await adminModel.findOne({ _id: data?.adminId });
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }

          const { value, error } = recipientValidation.updateRecipient(req.body);
          if (error) {
            return res.send(Response.userFailResp("Validation Failed!", error.message));
          }

          const recipient = await RecipientModel.findOne({ _id: id, adminId: isAdminExist._id });
          if (!recipient) {
            return res.send(Response.userFailResp("Recipient not found.", "Not Found"));
          }

          const updateFields = {};
          if (value.incidentTypes !== undefined) updateFields.incidentTypes = value.incidentTypes;

          const updated = await RecipientModel.findByIdAndUpdate(id, { $set: updateFields }, { new: true });

          return res.send(Response.userSuccessResp("Recipient updated successfully.", updated));
        } catch (error) {
          next(new AppError(error.message || "Failed to update recipient", 500));
        }
      }

}

export default new AlertService();
