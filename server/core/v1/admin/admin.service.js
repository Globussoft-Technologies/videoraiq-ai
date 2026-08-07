import AppError from "../../../utils/appError.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import dashboardSidebarModel from "../dashboard/dashboardSidebar.model.js";
import adminModel from "./admin.model.js";
import config from "config";
import axios from "axios";
import userModel from "../authorizedUsers/authorizedUsers.model.js";
import { encrypt,decrypt } from "../../../utils/cryptoUtils.js";
import UserValidation from "./admin.validate.js";
import roleModel from "../roles/roles.model.js";
import departmentModel from "../departments/departments.model.js"
import { deleteAuthorizedUserById } from "../users/users.service.js";
import users from "./../users/users.model.js"
import { retentionCutoff } from "../../../services/retention.service.js";
import Channel from "../channels/channels.model.js";
import { DETECTION_TYPES } from "../../../constants/detectionTypes.js";

async function runWithConcurrency(tasks, limit) {
  const executing = new Set();
  const results = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

async function syncDetectionScheduleTimezone(userId, timezone) {
  if (!userId || !timezone) return 0;

  const results = await Promise.all(
    Object.keys(DETECTION_TYPES).map((settingType) =>
      Channel.updateMany(
        {
          userId,
          [`detections.${settingType}.schedule.mode`]: "custom",
        },
        {
          $set: {
            [`detections.${settingType}.schedule.timezone`]: timezone,
          },
        },
      ),
    ),
  );

  return results.reduce((total, result) => total + (result.modifiedCount || 0), 0);
}

export const deletionJobs = new Map();

class AdminService {


  async signUP(req, res, next) {
    try {

        const userData = req.body;

        let detectionTypes = [
          'countPersons',
          'genericObjectDetection',
          'unauthorizedAccess'
        ];

        // Mapping for display names
      let displayNameMap = {
        // loiteringWithAuth: "Loitering With Authorization",
        // loiteringWithoutAuth: "Loitering Without Authorization",
        lineCrossing: "Line Crossing Detection",
        unauthorizedAccess: "Intrusion Detection",
        countPersons:"Person Counting",
        genericObjectDetection: "Generic Object Detection",
      };

      let detectionConfigs = detectionTypes.map(type => ({
          detectionType: type,
          displayName: displayNameMap[type] || type, // fallback to type if not in map
          isEnabled: false, // Default toggle (can be changed)
          allowedDetection: true, // Admin is allowed to view these
      }));

        // Check if user already exists
        let existingUser = await adminModel.findOne({ user_id: userData?.user_id });
    
        if (!existingUser) {
          const newUser = new adminModel({
            user_id: userData?.user_id,
            login: userData?.login,
            name_f: userData?.name_f ?? '',
            name_l: userData?.name_l ?? '',
            email: userData?.email
          });
    
          let adminData = await newUser.save();

          const config = await dashboardSidebarModel.create({
            adminId: adminData?._id,
            detectionConfigs,
          });

          return res.status(200).json(
            Response.userSuccessResp('Admin signup successful', {
              user: existingUser || userData
            })
          );

        }else{
          let isDashboardConfigAvailable = await dashboardSidebarModel.findOne({adminId:existingUser?._id});

          if(!isDashboardConfigAvailable) {
            const config = await dashboardSidebarModel.create({
              adminId: existingUser?._id,
              detectionConfigs,
            });
          }

          return res.status(200).json(
            Response.userSuccessResp('Admin signup successful', {
              user: existingUser || userData
            })
          );

        }



  
    } catch (error) {
      next(new AppError(error, 500));
    }
  }
  async fetch(req,res,next){
    try{
      const user_email = req?.verified?.userData?.user_email;
      let isAdminExist = await adminModel.findOne({email:user_email});
      if(!isAdminExist) return res.send(Response.userFailResp('Admin not found!','Validation Failed!'));

      return res.status(200).json(
        Response.userSuccessResp('Admin details fetched successfully.', {
          adminDetails: isAdminExist 
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async getEmpEmployees(req,res,next){
    try{
      const {orgId,user_email,adminId} = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({_id:adminId});
      if(!isAdminExist) return res.send(Response.userFailResp('Admin not found!','Validation Failed!'));

      let skip = Number(req.query.skip) ?? 0;
      let limit  = Number(req.query.limit) ?? 10;


    let employeesWithEmp_id = await userModel
    .find({
      emp_id: { $nin: [null, ""] }   // excludes null and empty string
    })
    .distinct("emp_id");

      
      const body = {  organization_id: orgId, 
        status: 1, 
        orgId: orgId, 
        skip: skip,
        limit: limit,
        exclude_emp_ids:employeesWithEmp_id?.length ? employeesWithEmp_id : [],
        secretKey: config.get('emp_secret_key') };
      
      let attendance = await axios.post(config.get('empDomain') + 'user/CCTVAllEmployeeList', body);
      if (attendance?.data) {
        let empOrgDataArray = attendance.data.data;
        //fetching current imported users
        const isUserExist = await userModel.find({ orgId: orgId })
        .select({
            emp_id: 1
        });
        if(isUserExist.length > 0){
            const importedEmployeeIds = new Set(isUserExist.map(obj => String(obj['emp_id'])));
            for(let i=0;i<empOrgDataArray?.length; i++){
                empOrgDataArray[i].importedStatus = importedEmployeeIds.has(String(empOrgDataArray[i].id));
            }
        }
        return res.send(Response.userSuccessResp('Employee List Fetched Successfully', empOrgDataArray))
    }
    else{
        return res.send(Response.userFailResp('Something went wrong'))
    }

    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async importEMPUsers(req, res, next) {
    try {
      const { orgId, user_email ,adminId} = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({ _id:adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }
      let ddData = req?.body;
      let userData = ddData.usersData;
  
      const results = [];
  
      for (const user of userData) {
        let {
          full_name: fullName,
          phone: phoneNumber,
          email,
          address: address1,
          department,
          department_id,
          location,
          timezone,
          role,
          password,
          first_name,
          last_name,
          photo_path,
          roles,
        } = user;
  
        let orgId = user.organization_id.toString();
        let emp_id = user.id.toString();
  
        const hashedPassword = await encrypt(`${first_name}@123`);
        password = hashedPassword;
        phoneNumber = phoneNumber.replace("-", "");
  
        // 🔹 Roles
        const validRoles = [];
        for (const r of roles) {
          let foundRole = await roleModel.findOne({
            orgId,
            empRoleId: r.role_id,
            roleName: r.role,
            softDelete: false,
          });

          if (!foundRole) {
            foundRole = await roleModel.create({
              orgId,
              adminId,
              empRoleId: r.role_id,
              roleName: r.role,
              isEmpRole: true,
              softDelete: false,
            });
          }
          validRoles.push(foundRole._id);
        }
  
        // 🔹 Department
        let userDepartment = await departmentModel.findOne({
          departmentName: department,
          empDepartmentId: department_id,
          softDelete: false,
        });
  
        let departmentId = null;
        if (userDepartment) {
          departmentId = userDepartment?._id;
        } else {
          userDepartment = await departmentModel.create({
            orgId,
            departmentName: department,
            empDepartmentId: department_id,
            isImportedFromEMP: true,
          });
          departmentId = userDepartment?._id;
        }

        let roleModelData = await roleModel.findOne({orgId,roleName:'employee'});
        // 🔹 Final user object
        const emp = {
          adminId,
          fullName,
          firstName: first_name,
          lastName: last_name,
          email,
          roleId: roleModelData?._id,
          departmentId,
          location,
          phoneNumber,
          address1,
          orgId,
          emp_id,
          timezone,
          password:`${first_name}@123`,
        };
  
        // 🔹 Validation
        const { value, error } = UserValidation.createUser(emp);
        if (error) {
          results.push({ email, status: "failed", error: error.details });
          continue; // don't send res here, just record the failure
        }
  
        const isDataExist = await userModel.findOne({ email: email });
        if (!isDataExist) {
          value.orgId = orgId;
          value.createdAt = new Date();
          value.email = value.email.toLowerCase();
          value.profilePics = []
          let userCreated = await userModel.create(value);
          results.push({ email, status: "created", userId: userCreated._id });
        } else {
          results.push({ email, status: "skipped", reason: "Already exists" });
        }
      }
  
      // ✅ Only send response once, after loop
      return res.send(Response.userSuccessResp("Users processed successfully.", results));
    } catch (error) {
      // console.log(error);
      next(new AppError(error, 500));
    }
  }

  async updateAdmin(req, res, next) {
    try {
      let {email,name_f,name_l,adminId} = req.body;
      let isAdminExist = await adminModel.findOne({ _id:adminId });

      if(!isAdminExist) return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));


      let updateAdmin = await adminModel.updateOne({_id:adminId},{$set:{email,name_f,name_l}});
      if(!updateAdmin) return res.send(Response.userFailResp("Admin not updated!", "Validation Failed!"));

      return res.send(Response.userSuccessResp("Admin updated successfully.", updateAdmin));
    } catch (error) {
      // console.log(error);
      next(new AppError(error, 500));
    }
  }

  async addEMPEmails(req, res, next) {
    try {
      const { email, adminId } = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({ _id: adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      let emails = req?.body?.emails ?? [];
      // Include the admin's own email if not already present
      if (email && !emails.includes(email)) {
        emails.push(email);
      }

      const results = [];
      const empDataUpdates = {};

      for (const empEmail of emails) {
        try {
          const apiResponse = await axios.post(
            `${config.get('empDomain')}/auth/info`,
            { email: empEmail },
            { headers: { 'Content-Type': 'application/json', accept: 'application/json' } }
          );

          // API returns: { "data": [{ "id": 9915, "email": "..." }] }
          const dataArr = apiResponse?.data?.data;
          if (dataArr && dataArr.length > 0) {
            const orgIdFromApi = dataArr[0]?.id?.toString();
            empDataUpdates[empEmail] = orgIdFromApi;
            results.push({ email: empEmail, status: 'success', orgId: orgIdFromApi });
          } else {
            results.push({ email: empEmail, status: 'not_found' });
          }
        } catch (apiErr) {
          results.push({ email: empEmail, status: 'failed', error: apiErr?.message });
        }
      }

      // Upsert into empData array: remove existing entries for these emails then push new ones
      if (Object.keys(empDataUpdates).length > 0) {
        const newEntries = Object.entries(empDataUpdates).map(([email, orgId]) => ({ email, orgId }));
        const emailsToUpdate = newEntries.map(e => e.email);
        // Remove stale entries first to avoid duplicates
        await adminModel.updateOne(
          { _id: adminId },
          { $pull: { empData: { email: { $in: emailsToUpdate } } } }
        );
        // Push fresh { email, orgId } objects
        await adminModel.updateOne(
          { _id: adminId },
          { $push: { empData: { $each: newEntries } } }
        );
      }

      return res.send(Response.userSuccessResp('EMP emails processed successfully.', results));
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async getEMPEmails(req, res, next) {
    try {
      const { adminId } = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({ _id: adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      return res.send(Response.userSuccessResp("EMP emails fetched successfully.", isAdminExist.empData ?? []));
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async updateEMPEmail(req, res, next) {
    try {
      const { adminId } = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({ _id: adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      const { oldEmail, newEmail } = req.body;
      if (!oldEmail || !newEmail) {
        return res.send(Response.userFailResp("oldEmail and newEmail are required.", "Validation Failed!"));
      }

      // Call EmpMonitor API to get orgId for the new email
      let orgId = null;
      try {
        const apiResponse = await axios.post(
          `${config.get('empDomain')}auth/info`,
          { email: newEmail },
          { headers: { 'Content-Type': 'application/json', accept: 'application/json' } }
        );
        const dataArr = apiResponse?.data?.data;
        if (dataArr && dataArr.length > 0) {
          orgId = dataArr[0]?.id?.toString();
        }
      } catch (apiErr) {
        return res.send(Response.userFailResp("Failed to fetch orgId for newEmail from EmpMonitor.", apiErr?.message));
      }

      if (!orgId) {
        return res.send(Response.userFailResp("No organisation found for the provided newEmail.", "Not Found"));
      }

      // Pull old entry, push updated one
      await adminModel.updateOne(
        { _id: adminId },
        { $pull: { empData: { email: oldEmail } } }
      );
      await adminModel.updateOne(
        { _id: adminId },
        { $push: { empData: { email: newEmail, orgId } } }
      );

      return res.send(Response.userSuccessResp("EMP email updated successfully.", { email: newEmail, orgId }));
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async deleteEMPEmail(req, res, next) {
    try {
      const { adminId } = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({ _id: adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      const { email } = req.body;
      if (!email) {
        return res.send(Response.userFailResp("email is required.", "Validation Failed!"));
      }

      // Collect orgId related to email
      const orgId = isAdminExist.empData.find(item => item.email === email)?.orgId;

      const result = await adminModel.updateOne(
        { _id: adminId },
        { $pull: { empData: { email } } }
      );

      // // If orgId is not found, return early
      // if (!orgId) {
      // return res.send(Response.userSuccessResp("EMP email deleted successfully.", { email, result }));
      // }

      // Fetch all employee data including ID and verified status in a single query
      // const employees = await userModel.find({ orgId: Number(orgId) }).select('_id verified');

      // // Delete all authorized users with concurrency limit (max 10 concurrent)
      // if (employees.length > 0) {
      //   const concurrencyLimit = 10;
      //   const totalEmployees = employees.length;

      //   deletionJobs.set(email, {
      //     email,
      //     orgId,
      //     totalUsers: totalEmployees,
      //     completedUsers: 0,
      //     totalOperations: totalEmployees * 3, // DB, SFTP, AI
      //     completedOperations: 0,
      //     percentage: 0,
      //     status: 'In Progress'
      //   });

      //   const runDeletion = async () => {
      //     try {
      //       const deletionTasks = employees.map(emp => async () => {
      //         const res = await deleteAuthorizedUserById(emp._id, emp);
      //         const job = deletionJobs.get(email);
      //         if (job) {
      //           let opsCompleted = 0;
      //           if (res?.status?.deletedFromDb) opsCompleted++;
      //           if (res?.status?.deletedFromSftp) opsCompleted++;
      //           if (res?.status?.deletedFromAi) opsCompleted++;
                
      //           job.completedOperations += opsCompleted;
      //           job.completedUsers += 1;
      //           job.percentage = Math.round((job.completedOperations / job.totalOperations) * 100);

      //           if (job.completedUsers === job.totalUsers) {
      //             job.status = 'Completed';
      //           }
      //         }
      //         return res;
      //       });

      //       await runWithConcurrency(deletionTasks, concurrencyLimit);
      //       console.log(`Deleted ${employees.length} authorized users for orgId: ${orgId}`);
      //     } catch (err) {
      //       console.error("Background deletion error:", err);
      //       const job = deletionJobs.get(email);
      //       if (job) job.status = 'Failed';
      //     }
      //   };

      //   // Fire and forget, no await
      //   runDeletion();
      // }

      return res.send(Response.userSuccessResp("EMP email deleted successfully.", { email, result }));
    } catch (error) {
      console.log(error);

      next(new AppError(error, 500));
    }
  }

  async getLocationByEmpEmail(req, res, next) {
    try {
      const { adminId } = req?.verified?.userData;
      let isAdminExist = await adminModel.findOne({ _id: adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      // Create a map of orgId to emails
      const orgIdToEmails = {};
      for (const emp of isAdminExist.empData) {
        if (!orgIdToEmails[emp.orgId]) {
          orgIdToEmails[emp.orgId] = [];
        }
        orgIdToEmails[emp.orgId].push(emp.email);
      }

      // Collect all unique org IDs from the admin's empData
      let getAllUniqueEMPOrgIds = [...new Set(isAdminExist.empData.map(item => item.orgId))];

      const seenOrgIds = new Set();
      const allUniqueLocations = [];
      const errors = [];

      // API supports only a single organization_id per call — iterate one by one
      for (const orgId of getAllUniqueEMPOrgIds) {
        try {
          const response = await axios.post(
            ` ${config.get('empDomain')}location/get-locations-dept-by-org`,
            {
              secretKey: config.get('emp_secret_key'),
              organization_id: Number(orgId),
            },
            { headers: { 'Content-Type': 'application/json' } }
          );

          const locations = response?.data?.data ?? [];
          const emails = orgIdToEmails[orgId] || [];

          for (const loc of locations) {
            if (loc?.location === 'Default') continue; // skip default locations
            const locOrgId = loc?.location_id;
            if (locOrgId !== undefined && locOrgId !== null && !seenOrgIds.has(locOrgId)) {
              seenOrgIds.add(locOrgId);
              const emailsStr = emails.length > 0 ? ` OrgEmail:-[${emails.join(', ')}]` : '';
              allUniqueLocations.push({
                ...loc,
                location: `${loc.location}${emailsStr}`
              });
            }
          }
        } catch (apiErr) {
          errors.push({ orgId, error: apiErr?.message });
        }
      }

      return res.send(
        Response.userSuccessResp("Locations fetched successfully.", {
          totalUnique: allUniqueLocations.length,
          locations: allUniqueLocations,
          ...(errors.length > 0 && { errors }),
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async getDeletionProgress(req, res, next) {
    try {
      const email = req.query.email;
      if (!email) {
        return res.send(Response.userFailResp("email is required.", "Validation Failed!"));
      }
      const job = deletionJobs.get(email);
      if (!job) {
        return res.send(Response.userFailResp("No deletion job found for this email.", "Not Found"));
      }
      return res.send(Response.userSuccessResp("Deletion progress fetched.", job));
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async getAllowedDetections(req, res, next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const admin = await adminModel.findById(adminId).select("detectionConfig").lean();
      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }
      return res.status(200).json(
        Response.userSuccessResp("Detection config fetched successfully", {
          detectionConfig: admin.detectionConfig || {},
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async updateAllowedDetections(req, res, next) {
    try {
      const { targetAdminId, detectionConfig } = req.body;

      if (!targetAdminId) {
        return res.status(400).json(Response.userFailResp("targetAdminId is required"));
      }
      if (!detectionConfig || typeof detectionConfig !== "object" || Array.isArray(detectionConfig)) {
        return res.status(400).json(Response.userFailResp("detectionConfig must be an object"));
      }

      const admin = await adminModel.findByIdAndUpdate(
        targetAdminId,
        { detectionConfig },
        { new: true, select: "detectionConfig" }
      ).lean();

      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Detection config updated successfully", {
          detectionConfig: admin.detectionConfig,
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async getAlertSwitches(req, res, next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const admin = await adminModel.findById(adminId).select("emailAlertsEnabled telegramAlertsEnabled").lean();
      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }
      return res.status(200).json(
        Response.userSuccessResp("Alert switches fetched successfully", {
          emailAlertsEnabled: admin.emailAlertsEnabled,
          telegramAlertsEnabled: admin.telegramAlertsEnabled,
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async updateEmailAlertsEnabled(req, res, next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const { emailAlertsEnabled } = req.body || {};
      if (typeof emailAlertsEnabled !== "boolean") {
        return res.status(400).json(Response.userFailResp("emailAlertsEnabled must be boolean"));
      }

      const admin = await adminModel.findByIdAndUpdate(
        adminId,
        { $set: { emailAlertsEnabled } },
        { new: true, select: "emailAlertsEnabled" }
      ).lean();

      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Email alerts switch updated successfully", {
          emailAlertsEnabled: admin.emailAlertsEnabled,
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async updateTelegramAlertsEnabled(req, res, next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const { telegramAlertsEnabled } = req.body || {};
      if (typeof telegramAlertsEnabled !== "boolean") {
        return res.status(400).json(Response.userFailResp("telegramAlertsEnabled must be boolean"));
      }

      const admin = await adminModel.findByIdAndUpdate(
        adminId,
        { $set: { telegramAlertsEnabled } },
        { new: true, select: "telegramAlertsEnabled" }
      ).lean();

      if (!admin) {
        return res.status(404).json(Response.userFailResp("Admin not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Telegram alerts switch updated successfully", {
          telegramAlertsEnabled: admin.telegramAlertsEnabled,
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async updateLogsSound(req, res, next) {
    try {
      const { adminId, memberId } = req?.verified?.userData;
      const { logsSound } = req.body;

      if (typeof logsSound !== "boolean") {
        return res.send(Response.userFailResp("logsSound boolean value is required.", "Validation Failed!"));
      }

      if (memberId) {
        // Authorized user
        const updatedUser = await users.findByIdAndUpdate(
          memberId,
          { $set: { logsSound } },
          { new: true }
        );
        if (!updatedUser) {
          return res.send(Response.userFailResp("User not found!", "Validation Failed!"));
        }
        return res.send(Response.userSuccessResp("logsSound updated successfully for user.", updatedUser));
      } else {
        // Admin
        const updatedAdmin = await adminModel.findByIdAndUpdate(
          adminId,
          { $set: { logsSound } },
          { new: true }
        );
        if (!updatedAdmin) {
          return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
        }
        return res.send(Response.userSuccessResp("logsSound updated successfully for admin.", updatedAdmin));
      }
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  async fetchLogsSound(req, res, next) {
    try {
      const { adminId, memberId } = req?.verified?.userData;
      let logsSound = false;

      if (memberId) {
        // Authorized user
        const userSettings = await users.findById(memberId).select("logsSound");
        if (!userSettings) {
          return res.send(Response.userFailResp("User not found!", "Validation Failed!"));
        }
        logsSound = userSettings.logsSound || false;
        return res.send(Response.userSuccessResp("logsSound fetched successfully for user.", { logsSound }));
      } else if (adminId) {
        // Admin
        const adminSettings = await adminModel.findById(adminId).select("logsSound");
        if (!adminSettings) {
          return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
        }
        logsSound = adminSettings.logsSound || false;
        return res.send(Response.userSuccessResp("logsSound fetched successfully for admin.", { logsSound }));
      } else {
        return res.send(Response.userFailResp("Invalid Token!", "Validation Failed!"));
      }
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  // All IANA timezones for the frontend dropdown (built-in, no dependency).
  // Optional ?search= filters by case-insensitive substring on the zone name.
  async getTimezones(req, res, next) {
    try {
      let timezones =
        typeof Intl.supportedValuesOf === "function"
          ? Intl.supportedValuesOf("timeZone")
          : [];

      // Some Node/ICU builds list legacy names (e.g. "Asia/Calcutta"); present
      // the modern IANA name instead. Validation accepts both.
      const rename = { "Asia/Calcutta": "Asia/Kolkata" };
      timezones = timezones.map((tz) => rename[tz] || tz);

      const search = req.query?.search;
      if (search && typeof search === "string" && search.trim()) {
        const q = search.trim().toLowerCase();
        timezones = timezones.filter((tz) => tz.toLowerCase().includes(q));
      }

      return res.send(
        Response.userSuccessResp("Timezones fetched successfully", {
          totalCount: timezones.length,
          timezones,
        }),
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  // Save the admin's selected IANA timezone (validated against the built-in list).
  async updateTimezone(req, res, next) {
    try {
      const { adminId } = req?.verified?.userData || {};
      const { timezone } = req.body;

      if (!adminId) {
        return res.send(Response.userFailResp("Invalid Token!", "Validation Failed!"));
      }
      if (!timezone || typeof timezone !== "string") {
        return res.send(Response.userFailResp("timezone is required.", "Validation Failed!"));
      }
      // Validate by whether the runtime accepts it (covers canonical names AND
      // aliases like Asia/Kolkata that may not appear in supportedValuesOf).
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.send(Response.userFailResp("Invalid IANA timezone.", "Validation Failed!"));
      }

      const updatedAdmin = await adminModel.findByIdAndUpdate(
        adminId,
        { $set: { timezone } },
        { new: true },
      );
      if (!updatedAdmin) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }
      const schedulesUpdated = await syncDetectionScheduleTimezone(
        updatedAdmin.user_id,
        updatedAdmin.timezone,
      );
      return res.send(
        Response.userSuccessResp("Timezone updated successfully.", {
          timezone: updatedAdmin.timezone,
          schedulesUpdated,
        }),
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  // Fetch the admin's currently saved timezone (null if not set).
  async fetchTimezone(req, res, next) {
    try {
      const { adminId } = req?.verified?.userData || {};
      if (!adminId) {
        return res.send(Response.userFailResp("Invalid Token!", "Validation Failed!"));
      }
      const admin = await adminModel.findById(adminId).select("timezone");
      if (!admin) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }
      return res.send(
        Response.userSuccessResp("Timezone fetched successfully.", {
          timezone: admin.timezone || null,
        }),
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  // Operator action: set (or clear) a target admin's service endpoint overrides.
  // A field set to null/"" reverts to the global config default. Only fields
  // present in the body are updated. Kept named updateStreamHost for route
  // compatibility. Overridable fields:
  //   streamHost, streamToken, dsAuthUsersAPI, attendanceUrl, detectionUrl,
  //   telegramBotToken, telegramChatId, retention{Incidents,Attendance,AccessLogs}
  async updateStreamHost(req, res, next) {
    try {
      const { userId } = req.body;
      const overridable = [
        "streamHost",
        "streamToken",
        "dsAuthUsersAPI",
        "attendanceUrl",
        "detectionUrl",
        "telegramBotToken",
        "telegramChatId",
      ];

      if (!userId) {
        return res.send(Response.userFailResp("userId is required.", "Validation Failed!"));
      }

      const provided = overridable.filter((f) => req.body[f] !== undefined);
      if (provided.length === 0) {
        return res.send(Response.userFailResp(`Provide one of: ${overridable.join(", ")}.`, "Validation Failed!"));
      }

      const isValid = (v) => v === null || v === "" || typeof v === "string";
      for (const f of provided) {
        if (!isValid(req.body[f])) {
          return res.send(Response.userFailResp(`${f} must be a string, empty string, or null.`, "Validation Failed!"));
        }
      }

      // Only set provided fields; normalise empty string to null (falls back to global).
      const update = {};
      for (const f of provided) {
        update[f] = req.body[f] ? String(req.body[f]).trim() : null;
      }

      const updatedAdmin = await adminModel.findOneAndUpdate(
        { user_id: String(userId) },
        { $set: update },
        { new: true }
      );
      if (!updatedAdmin) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      return res.send(
        Response.userSuccessResp("Stream config updated successfully.", {
          user_id: updatedAdmin.user_id,
          streamHost: updatedAdmin.streamHost,
          streamToken: updatedAdmin.streamToken,
          dsAuthUsersAPI: updatedAdmin.dsAuthUsersAPI,
          attendanceUrl: updatedAdmin.attendanceUrl,
          detectionUrl: updatedAdmin.detectionUrl,
          telegramBotToken: updatedAdmin.telegramBotToken,
          telegramChatId: updatedAdmin.telegramChatId,
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

  // Set or clear a target admin's DataRetention overrides. Only keys present in
  // the body change; pass null (or "") to clear one back to the global default.
  async updateRetention(req, res, next) {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.send(Response.userFailResp("userId is required.", "Validation Failed!"));
      }

      const SPEC_KEYS = ["incidents", "attendance", "accessLogs"];
      // Bounds keep a typo from turning into an unbounded sweep loop.
      const NUM_KEYS = { batchSize: [1, 10000], maxRunMinutes: [1, 1440], intervalHours: [1, 8760] };
      const fail = (msg) => res.send(Response.userFailResp(msg, "Validation Failed!"));
      const update = {};

      if (req.body.enabled !== undefined) {
        const v = req.body.enabled;
        if (v !== null && typeof v !== "boolean") {
          return fail("enabled must be true, false, or null.");
        }
        update["retention.enabled"] = v;
      }

      for (const k of SPEC_KEYS) {
        const v = req.body[k];
        if (v === undefined) continue;
        if (v === null || v === "") {
          update[`retention.${k}`] = null;
          continue;
        }
        // Validated with the sweeper's own parser, so the API can never store a
        // spec the sweeper won't read — which would silently mean "keep forever".
        const spec = String(v).trim();
        if (spec.toLowerCase() !== "never" && !retentionCutoff(spec)) {
          return fail(`${k} must be like "90d", "3m", "1y", or "never" (or null for the global default).`);
        }
        update[`retention.${k}`] = spec.toLowerCase() === "never" ? "never" : spec;
      }

      for (const [k, [min, max]] of Object.entries(NUM_KEYS)) {
        const v = req.body[k];
        if (v === undefined) continue;
        if (v === null || v === "") {
          update[`retention.${k}`] = null;
          continue;
        }
        const n = Number(v);
        if (!Number.isInteger(n) || n < min || n > max) {
          return fail(`${k} must be a whole number between ${min} and ${max} (or null for the global default).`);
        }
        update[`retention.${k}`] = n;
      }

      if (!Object.keys(update).length) {
        return fail(`Provide one of: enabled, ${SPEC_KEYS.join(", ")}, ${Object.keys(NUM_KEYS).join(", ")}.`);
      }

      const updatedAdmin = await adminModel.findOneAndUpdate(
        { user_id: String(userId) },
        { $set: update },
        { new: true }
      );
      if (!updatedAdmin) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      return res.send(
        Response.userSuccessResp("Retention config updated successfully.", {
          user_id: updatedAdmin.user_id,
          retention: updatedAdmin.retention,
        })
      );
    } catch (error) {
      next(new AppError(error, 500));
    }
  }

}

export default new AdminService();
