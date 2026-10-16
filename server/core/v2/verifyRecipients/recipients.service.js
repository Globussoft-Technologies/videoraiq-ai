
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
import Department from "../departments/departments.model.js";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";
import { emitRecipientVerified } from "../../../socket.js";

// A recipient's departments must all be this admin's live departments.
const ownDepartments = async (adminId, departmentIds) =>
  !departmentIds.length
  || (await Department.countDocuments({ _id: { $in: departmentIds }, adminId, softDelete: false })) === departmentIds.length;

// A user's own recipient: the user's Camera Access departments (fixed here,
// edited on the Users page) plus any extra ones picked on the recipient.
// accessDepartmentIds tells the form which ones it can't remove.
const linkedDepartments = (ownDepartments, accessDepartments) => {
  const fixed = (accessDepartments || []).filter(Boolean);
  const fixedIds = new Set(fixed.map((d) => String(d._id)));
  const extra = (ownDepartments || []).filter((d) => d && !fixedIds.has(String(d._id)));
  return { departmentIds: [...fixed, ...extra], accessDepartmentIds: [...fixedIds] };
};

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
          // Shared by both channels below.
          // Departments are labels for finding people on the Detections page; no effect on alerts.
          const departmentIds = value?.departmentIds || [];
          if (!(await ownDepartments(isAdminExist._id, departmentIds))) {
            return res.send(Response.userFailResp('Validation Failed!', 'One or more departments are invalid'));
          }
          const scope = { departmentIds, severityByType: value?.severityByType || {} };

          let recipientData = {};
          let token = generateToken();
          
          if (alertType === 'email' && value?.email) {
            // Check for duplicate
            const existing = await RecipientModel.findOne({
              adminId: isAdminExist._id,
              type: 'email',
              value: value.email,
            }).collation({ locale: 'en', strength: 2 }); // any letter case: a user's own row is stored lowercase
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
              ...scope,
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
              ...scope,
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
          emitRecipientVerified({ adminId: recipient.adminId, recipientId: recipient._id });

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
              .populate('departmentIds', 'departmentName') // names for the list, form and picker
              .sort(sortBy)
              .skip(parseInt(skip))
              .limit(parseInt(limit)),
            RecipientModel.countDocuments(filter),
          ]);

          // A user's own recipient shows the user's Camera Access departments,
          // read live, so the Users and Alert Recipients pages can't disagree.
          // Extra departments picked on the recipient are added (linkedDepartments).
          const userIds = alerts.map((alert) => alert.userId).filter(Boolean);
          const access = userIds.length
            ? await authorizedChannelsModel.find({ userId: { $in: userIds } })
              .select('userId departmentIds')
              .populate('departmentIds', 'departmentName')
              .lean()
            : [];
          const departmentsByUser = new Map(access.map((a) => [String(a.userId), a.departmentIds || []]));

          const updatedAlerts = await Promise.all(
            alerts.map(async (alert) => {
              const count = await DetectionSetting.countDocuments({
                alerts: alert._id,
              });
          
              const doc = alert.toObject();
              return {
                ...doc,
                ...(doc.userId ? linkedDepartments(doc.departmentIds, departmentsByUser.get(String(doc.userId))) : {}),
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
            // A user's own row goes when the user is deleted (Users page).
            if (emailRecipient.userId) {
              return res.send(Response.userFailResp("This recipient belongs to a user. Delete the user on the Users page, or clear its alert types to stop alerts."));
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
          // A user's row takes its name from the user record. Its departmentIds
          // are only the extras: Camera Access ones are added when listed.
          if (recipient.userId) {
            delete value.fullName;
          }

          const updateFields = {};
          if (value.fullName !== undefined) updateFields.fullName = value.fullName;
          if (value.incidentTypes !== undefined) updateFields.incidentTypes = value.incidentTypes;
          if (value.departmentIds !== undefined) {
            if (!(await ownDepartments(isAdminExist._id, value.departmentIds))) {
              return res.send(Response.userFailResp("Validation Failed!", "One or more departments are invalid"));
            }
            updateFields.departmentIds = value.departmentIds;
          }
          if (value.severityByType !== undefined) updateFields.severityByType = value.severityByType;

          if (Object.keys(updateFields).length === 0) {
            return res.send(Response.userFailResp("Nothing to update.", "Validation Failed!"));
          }

          const updated = await RecipientModel.findByIdAndUpdate(id, { $set: updateFields }, { new: true });

          return res.send(Response.userSuccessResp("Recipient updated successfully.", updated));
        } catch (error) {
          next(new AppError(error.message || "Failed to update recipient", 500));
        }
      }

}

export default new AlertService();
