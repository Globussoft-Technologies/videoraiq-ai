
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import adminModel from "../admin/admin.model.js";
import AuthUsersValidator from "./authorizedUsers.validate.js"
import authorizedUsersModel from "./authorizedUsers.model.js";
import rolesModel from "../roles/roles.model.js";
import departmentsModel from "../departments/departments.model.js";
import path from "path";
import axios from "axios";
import { withSFTPConnection } from "../../../utils/newSFTPConnectionCheck.js";
import {
  checkSftpConnection
} from "../../../utils/sftpConnectionCheck.js";
import stream from 'stream';
import { RolesMessageNew } from "../../../language/language.translator.js";
import { decrypt } from "../../../utils/cryptoUtils.js";
import { generateToken } from "../../../middlewares/decodeToken.js";
import { resolveAdminEndpoints } from "../../../utils/adminEndpoints.js";
import config from "config";
import mongoose from "mongoose";
import shiftModel from "./../shifts/shifts.model.js"
import channelsModel from "../channels/channels.model.js";
import LocationModel from "../locations/location.model.js";
import OptimizedAccessLogs from "../accesslogs/newAccessLogs.model.js";
import faceImagesModel from "../faceImages/faceImages.model.js";


import fs from 'fs';
import {
    pipeline
} from 'stream/promises';
import {
    createWriteStream,
    createReadStream
} from 'fs';


const cacheDir = path.join('/tmp', 'media-cache'); // You can change this to './cache' or any path

if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, {
        recursive: true
    });
}
// Percent-encode each path segment so filenames with spaces/#/&/unicode
// build valid, fetchable URLs; the /api/v1/uploads route decodes them back.
const toMediaUrl = (domain, p) =>
  `${domain}/api/v1/uploads${String(p ?? "").split("/").map(encodeURIComponent).join("/")}`;

// axios defaults to no timeout, so a hung face-recognition service would keep
// a registration request (and anything it holds) alive forever.
const FACE_SERVICE_TIMEOUT_MS = 60_000;

class AuthUsersService {
  
  constructor() {
    this.secretKey = config.get("jwt.secretKey");
    this.tokenExpiryTime = config.get("jwt.tokenExpiryTime");
    this.backendDomain = config.get("backendDomain");
    this.DSAuthUsersAPI = config.get("DSAuthUsersAPI");
    this.DSAuthUsersApiDB = config.get("DSAuthUsersApiDB");
    
  }

  getDbName(adminId) {
    return `${adminId.toString()}_faces`;
  }

  // Per-admin DS auth-users API host (falls back to config default).
  async getDSAuthUsersAPI(adminId) {
    const { dsAuthUsersAPI } = await resolveAdminEndpoints(adminId);
    return dsAuthUsersAPI;
  }
  // Resolve the current admin from the verified token payload. Prefer
  // adminId because it is the canonical app-side identifier; fall back to the
  // older user_id/email pair for legacy tokens.
  async resolveAdminFromVerifiedUser(data) {
    if (data?.adminId) {
      const admin = await adminModel.findById(data.adminId);
      if (admin) return admin;
    }

    const legacyQuery = {};
    if (data?.user_id !== undefined && data?.user_id !== null) {
      legacyQuery.user_id = data.user_id.toString();
    }
    if (data?.user_email) {
      legacyQuery.email = data.user_email;
    }

    if (!Object.keys(legacyQuery).length) return null;
    return adminModel.findOne(legacyQuery);
  }
  /**
   * Delete all authorized users for the current admin.
   * Only deletes SFTP/AI data if user is verified.
   */
  async deleteAllAuthUsers(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      if (!data?.adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in user data", "Validation Failed!"));
      }

      // Check if admin exists
      const isAdminExist = await adminModel.findOne({
        _id: data.adminId,
      });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      // Find all users for this admin
      const users = await authorizedUsersModel.find({ adminId: data.adminId });
      if (!users.length) {
        return res.status(404).json(Response.userFailResp("No authorized users found for this admin"));
      }

      // 🌐 Connect to SFTP once
      let sftp;
      try {
        sftp = await checkSftpConnection();
      } catch (e) {
        sftp = null;
      }

      // Track results
      const deletedUsers = [];
      const errors = [];

      // --- DELETE ALL DEPARTMENTS FOR THIS ADMIN ---
      try {
        // const departmentsModel = (await import("../departments/departments.model.js")).default;
        await departmentsModel.deleteMany({
            adminId: data.adminId,
            isImportedFromEMP:true
          });
      } catch (err) {
        errors.push({ type: "departments", error: err.message });
      }

      // --- CLEAR DEPARTMENT ARRAY IN CHANNELS FOR THIS ADMIN ---
      try {
        // const channelsModel = (await import("../channels/channels.model.js")).default;
        await channelsModel.updateMany(
          { userId: data.user_id.toString() },
          { $set: { department: [] } }
        );
      } catch (err) {
        errors.push({ type: "channels", error: err.message });
      }


      // --- DELETE ALL LOCATIONS FOR THIS ADMIN (from users and locations collection) ---
      try {
        // Remove location and locationId from users
        await authorizedUsersModel.updateMany(
          { adminId: data.adminId },
          { $unset: { location: "", locationId: "" } }
        );
        // Remove all locations for this admin from the locations collection

       await LocationModel.deleteMany({
          adminId: data.adminId,
          isImportedFromEMP:true
        });
      } catch (err) {
        errors.push({ type: "locations", error: err.message });
      }

      for (const user of users) {
        try {
          // Only delete media/AI if verified
          if (user.verified) {
            // Delete profilePics from SFTP and cache
            if (Array.isArray(user.profilePics)) {
              for (const pic of user.profilePics) {
                try {
                  // Local cache
                  const fileName = path.basename(pic);
                  const cachedFilePath = path.join(cacheDir, fileName);
                  if (fs.existsSync(cachedFilePath)) {
                    const stats = fs.lstatSync(cachedFilePath);
                    if (stats.isFile()) {
                      fs.unlinkSync(cachedFilePath);
                    } else if (stats.isDirectory()) {
                      fs.rmSync(cachedFilePath, { recursive: true, force: true });
                    }
                  }
                  // SFTP
                  if (sftp) {
                    const exists = await sftp.exists(pic);
                    if (exists === '-') {
                      await sftp.delete(pic);
                    } else if (exists === 'd') {
                      await sftp.rmdir(pic, true);
                    }
                  }
                } catch (err) {
                  // Ignore file errors, log if needed
                }
              }
            }
            // Delete AI user data
            try {
              const url = `${await this.getDSAuthUsersAPI(user.adminId)}/delete?uid=${user._id.toString()}&db=${this.getDbName(user.adminId)}`;
              await axios.delete(url, { headers: { accept: "application/json" } });
            } catch (err) {
              // Ignore AI errors, log if needed
            }
          }
          // Delete user from DB
          await authorizedUsersModel.findByIdAndDelete(user._id);
          deletedUsers.push(user._id);
        } catch (err) {
          errors.push({ userId: user._id, error: err.message });
        }
      }

      return res.status(200).json(Response.userSuccessResp(
        `Deleted ${deletedUsers.length} authorized users for this admin. Departments and locations deleted, channels updated.`,
        { deletedUsers, errors }
      ));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to delete all authorized users.", error.message));
    }
  }

    async fetchAuthUser(req, res, _next) {
        try {
          const data = req?.verified?.userData;
          
          const { userId, skip = 0, limit = 10, search = '',verified } = req.query;
          const { roleIds, departmentIds: selectedDepartments, locations, status } = req.body;
          
          let authorizedChannel = req?.verified?.authorizedChannel?.channels || [];
          let authorizedNVRs = req?.verified?.authorizedChannel?.nvrIds || [];
          let departmentIds = req?.verified?.authorizedChannel?.departmentIds || [];
          
          // Check if admin is valid
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId,
          });
          
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
          
          if (userId) {            
            const user = await authorizedUsersModel.findById(userId, null, { memberId: data?.memberId });
      
            if (!user) {
              return res.status(200).json(Response.userSuccessResp("Authorized user not found", {
                totalCount: 0,
                users: [],
              }));
            }
      
            return res.status(200).json(Response.userSuccessResp("Authorized user fetched successfully", {
              totalCount: 1,
              users: [user],
            }));
          }
          
          const parsedSkip = parseInt(skip);
          const parsedLimit = parseInt(limit);
          
          // if (selectedDepartments?.length) {
          //   let isDepartmentExist = await departmentsModel.find({ _id: { $in: selectedDepartments } }, null, { memberId: data?.memberId });
          //   if (isDepartmentExist?.length !== selectedDepartments?.length) {
          //     return res.send(Response.userFailResp("One or more DepartmentIds do not exist. Please provide valid departmentIds", "Validation Failed!"));
          //   }
          // }
          
          // ✅ Check if all roleIds exist (if provided)
          if (roleIds?.length) {
            const rolesCount = await rolesModel.countDocuments({ _id: roleIds[0]  });
            
            if (rolesCount !== roleIds.length) {
              return res.send(
                Response.userFailResp(
                  "One or more roleIds do not exist. Please provide valid roleIds",
                  "Validation Failed!"
                )
              );
            }
          }
          
          // Build filter condition dynamically
          const filter = { adminId: data?.adminId };

          if(verified){
            filter.verified = verified;
          }

          if (status === 'active') {
            filter.$and = [
              ...(filter.$and || []),
              {
                $or: [
                  { status: 'active' },
                  { status: { $exists: false } },
                  { status: null },
                  { status: '' },
                ],
              },
            ];
          } else if (status === 'suspended') {
            filter.status = 'suspended';
          }

          // Apply role filter
          if (roleIds?.length) {
            filter.roleId = roleIds[0];
          }
          
          // Apply department filter if given
          if (selectedDepartments?.length>0) {
            
            filter.departmentId = { $in: selectedDepartments?.map(id => new mongoose.Types.ObjectId(id)) };
          }
          
          // Search logic
          if (search && search.trim() !== '') {
            const regex = new RegExp(search.trim(), 'i');
          
            const departments = await departmentsModel.find(
              { departmentName: regex, adminId: data?.adminId },
              { _id: 1 },
              { memberId: data?.memberId }
            );
          
            const departmentIds = departments.map(dep => dep._id);
          
            filter.$or = [
              { userName: regex },
              { email: regex },
            ];
          
            if (departmentIds.length > 0) {
              filter.$or.push({ departmentId: { $in: departmentIds } });
            }
          }
          
          // ✅ Apply includedDepartments only if memberId exists
          // if (data?.memberId) {
          //   const includedDepartments = departmentIds.map(id => id.toString());
          
          //   // If departmentId is already set, check if it's allowed
          //   if (filter.departmentId && filter.departmentId.$in) {
          //     const selectedSet = filter?.departmentId?.$in.map(id => id.toString());
              
          //     // Filter to ONLY departments they are authorized for
          //     const validSelected = selectedSet?.filter(id => includedDepartments.includes(id));
          
          //     // ❌ If no valid departments, force empty results
          //     if (validSelected.length === 0) {
          //       filter.departmentId = { $in: [] };
          //     } else {
          //       filter.departmentId = { $in: validSelected?.map(id => new mongoose.Types.ObjectId(id)) };
          //     }
          //   } else {
          //     // No specific department — limit to allowed departments
          //     filter.departmentId = { $in: includedDepartments?.map(id => new mongoose.Types.ObjectId(id)) };
          //   }
          // }

          //Add locations filter add regex for location search
          if(locations?.length){
            filter.location = { $in: locations };
          }

          
          const [users, totalCount] = await Promise.all([
            authorizedUsersModel
              .find(filter, null, { memberId: data?.memberId })
              // .populate("roleIds", "role empRoleId")
              .populate("departmentId", "departmentName empDepartmentId")
              .sort({ createdAt: -1 })
              .skip(parsedSkip)
              .limit(parsedLimit),
            authorizedUsersModel.countDocuments(filter, { memberId: data?.memberId }),
          ]);
          
          return res.status(200).json(Response.userSuccessResp("Authorized users fetched successfully", {
            totalCount,
            users,
          }));
      
        } catch (error) {
          logger.error(error);
          return res
            .status(500)
            .json(Response.errorResp("Failed to fetch authorized user(s).", error.message));
        }
      }
      
    
    async createAuthUser(req, res, _next) {
      try {
        const data = req?.verified?.userData;
        const { firstName, lastName, email ,departmentId,designation,branch,shiftId,numberPlate,vehicleNumber,location} = req.body;
        // Self-registration via an invite link. multipart/form-data delivers
        // every field as a string, so "true" is what actually arrives.
        const userRegistrByLink = String(req.body.userRegistrByLink) === "true";

        // const { error ,value} = AuthUsersValidator.createAuthUser(req?.body);

        // if(error) return res.send(Response.validationFailResp(error.message,"Validation Failed!"));


        // const roleIds = [req.body.roleIds];

        //   // 🔹 Roles
        //   const validRoles = await rolesModel.find({ _id: { $in: roleIds } }).select("_id");

        //   const foundRoleIds = validRoles.map(r => r._id.toString());
        //   const invalidRoles = roleIds?.filter(id => !foundRoleIds.includes(id));


        //   if (invalidRoles?.length > 0) {
        //     let employeeRole = await rolesModel.findOne({roleName:"employee"}).select("_id");
        //     foundRoleIds.push(employeeRole._id.toString());
        //     // return res.send(Response.validationFailResp("Invalid roleId, please provide valid roleId","Validation Failed!"));
        //   }
          let isShiftExist
          if(shiftId){
            isShiftExist = await shiftModel.findById(shiftId);
            if(!isShiftExist) return res.send(Response.validationFailResp("ShiftId does not Exist. Please provide valid ShiftId","Validation Failed!"));
          }

           
          // 🔹 Department
          let department = null;
          if (departmentId && departmentId.trim() !== "") {
            if (!mongoose.Types.ObjectId.isValid(departmentId)) {
              return res.send(Response.validationFailResp("Invalid DepartmentId format, please provide valid departmentId","Validation Failed!"));
            }
            department = await departmentsModel.findById(departmentId).select("_id");
            if (department === null) {
              return res.send(Response.validationFailResp("Invalid DepartmentId, please provide valid departmentId","Validation Failed!"));
            }
          }


        // Check if admin is valid
        const isAdminExist = await adminModel.findOne({
         _id: data?.adminId,
        });

    
        if (!isAdminExist) {
          return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
        }
    
        // Check required fields
        if (!firstName || !lastName || !email ) {
          return res.status(400).json(Response.userFailResp("Missing required fields or profilePics is empty"));
        }

        //At least 1 profile pic should be added
        if (!req.files || req.files.length < 1) {
          return res.status(400).json(
            Response.errorResp('Validation Failed!', 'At least 1 profile pic should be added')
          );
        }

        // Hold a pooled SFTP connection for the upload only. It used to be
        // acquired at the top of the handler and released in a finally, which
        // pinned 1 of the 8 pool slots across the Mongo writes and the
        // unbounded face-service call below — 8 in-flight registrations
        // exhausted the pool and broke uploads AND downloads process-wide.
        const uploadedFiles = await withSFTPConnection((sftp) =>
          uploadFilesToSFTP({
            files: req.files,
            mediaType: "image",
            folderName: `${firstName}${lastName}`,
            sftp,
          })
        );



        if(!uploadedFiles?.length){
          return res.status(400).json(
            Response.errorResp('Validation Failed!', 'At least 1 profile pic should be added')
          );
        }
    
        // Check if any user exists with same firstName, lastName, or email
        const duplicateUser = await authorizedUsersModel.findOne({
          $and: [
            { email },
            { adminId:data?.adminId },
          ],
        });
        
        
        if (duplicateUser) {
            return res.status(409).json(Response.userFailResp(
            "Authorized user with email already exists"
            ));
        }
        // Create the authorized user
        const cleanedFirstName = firstName?.trim();
        const cleanedLastName = lastName?.trim();

        const newUser = await authorizedUsersModel.create({
          adminId: isAdminExist._id,
          shiftId: isShiftExist?._id || null,
          firstName: cleanedFirstName,
          lastName: cleanedLastName,
          userName: `${cleanedFirstName} ${cleanedLastName}`,
          // roleIds: foundRoleIds,
          departmentId: department,
          email,
          profilePics : uploadedFiles,
          designation,
          branch,
          numberPlate,
          vehicleNumber,
          location
        });


        // ✅ Proceed only if user creation was successful
        if (newUser && newUser._id) {
          const payload = {
            uid: newUser._id.toString(),
            firstName: newUser.firstName || "",
            lastName: newUser.lastName || "",
            email: newUser.email || "",
            department: newUser.departmentId?.departmentName || "",
            branch: newUser.branch || "",
            designation: newUser.designation || "",
            profileImages:  Array.isArray(uploadedFiles)
            ? uploadedFiles.map(pic => toMediaUrl(this.backendDomain, pic))
            : [],
            db: this.getDbName(newUser.adminId), // 🔹 replace with your actual DB name
            admin_id: newUser.adminId?.toString(),
          };
          try {
            
            const response = await axios.post(
              `${await this.getDSAuthUsersAPI(newUser.adminId)}/register`,
              payload,
              {
                headers: { "Content-Type": "application/json" },
                timeout: FACE_SERVICE_TIMEOUT_MS,
              }
            );
            console.log("✅ Face Auth Registered in AI service:", response.data);
          } catch (err) {
            
            console.error("❌ Failed to register user in Face Auth service:", err.response?.data?.message);
            if(err.response?.data?.message==="User already registered"||err.response?.data?.message==="No valid face detected"){
              //delete duplicated unverified user that was created
              await authorizedUsersModel.findByIdAndDelete(newUser._id);
              
              return res
                .status(409)
                .json(
                  Response.errorResp(
                    "A user with similar facial data is already registered.",
                    "Authorized user creation failed."
                  )
                );
              }



            // A link-registered user has no admin around to review a
            // half-created record, so a face-service failure must leave
            // nothing behind rather than an unverified row nobody acts on.
            // Admin-created users keep the existing verified:false marking.
            if (userRegistrByLink) {
              await authorizedUsersModel.findByIdAndDelete(newUser._id);
              // Drop the images too, or every failed retry orphans 3 more.
              await deleteFileFromStorage(uploadedFiles, cacheDir).catch(() => {});
            } else {
              //Update user as unverified
              await authorizedUsersModel.findByIdAndUpdate(
                newUser._id,
                { verified: false },
                { new: true }
              );
            }
          return res
          .status(500)
          .json(Response.errorResp(err.response?.data?.message,"Failed to create authorizedUser."));
          }
        } else {
          console.error("❌ User creation failed. Skipping Face Auth registration.");
        }

        return res.status(201).json(
          Response.userSuccessResp("Authorized user created successfully", newUser)
        );
    
      } catch (error) {
        logger.error(error);
        if(error.response?.data?.message==="User already registered"){
        return res
          .status(409)
          .json(
            Response.errorResp(
              "A user with similar facial data is already registered.",
              "Authorized user creation failed."
            )
          );

        }
        return res
          .status(500)
          .json(Response.errorResp(error.response?.data?.message,"Failed to create authorizedUser."));
      }
    }

    async verifyUser(req, res, _next) {
      try {
        const data = req?.verified?.userData;
        const uploadedFile = req.file || (req.files && (req.files.file || (Array.isArray(req.files) ? req.files[0] : null)));
        
        if (!uploadedFile) {
          return res
            .status(400)
            .json(Response.userFailResp("Missing file in query"));
        }

        const formData = new FormData();
        const blob = new Blob([uploadedFile.buffer], { type: uploadedFile.mimetype || 'image/webp' });
        formData.append('files', blob, uploadedFile.originalname || 'upload.webp');
        formData.append('threshold', '0.6');
        formData.append('nas_upload', 'false');
        formData.append('image_ids', '');
        formData.append('db', this.getDbName(data?.adminId));

        const faceAuthResponse = await axios.post(
          `${await this.getDSAuthUsersAPI(data?.adminId)}/recognise_bulk`,
          formData,
          {
            headers: {
              'accept': 'application/json'
            }
          }
        );

        const result = faceAuthResponse.data;
        if (!result || !result.results || result.results.length === 0) {
           return res.status(200).json(Response.userSuccessResp("No match found", { match: false, details: null }));
        }

        const faceResult = result.results[0];

        if (faceResult.recognized === false || faceResult.message === "No match") {
           return res.status(200).json(Response.userSuccessResp("User not verified", { verified: false }));
        } else {
           // Successfully recognized user
           return res.status(200).json(Response.userSuccessResp("User verified", { verified: true, identity: faceResult.identity }));
        }
        
      } catch (error) {
        logger.error(error);
        return res
          .status(500)
          .json(Response.errorResp("Failed to verify user", error.message));
      }
    }

async updateAuthUser(req, res, _next) {
  try {
    const data = req?.verified?.userData;
    const { userId } = req.query;
    const {
      firstName,
      lastName,
      email,
      departmentId,
      designation,
      branch,
      shiftId,
      numberPlate,
      vehicleNumber,
      location
    } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json(Response.userFailResp("Missing userId in query"));
    }

    // 🔹 Validate Shift
    if (shiftId) {
      const isShiftExist = await shiftModel.findById(shiftId);
      if (!isShiftExist) {
        return res.send(
          Response.validationFailResp(
            "ShiftId does not Exist. Please provide valid ShiftId",
            "Validation Failed!"
          )
        );
      }
    }

    // 🔹 Validate Admin
    const isAdminExist = await adminModel.findOne({
      _id: data?.adminId,
    });

    if (!isAdminExist) {
      return res.send(
        Response.userFailResp("Admin not found!", "Validation Failed!")
      );
    }

    // 🔹 Validate Department
    const department = await departmentsModel
      .findById(departmentId)
      .select("_id");

    if (departmentId && !department) {
      return res.send(
        Response.validationFailResp(
          "Invalid DepartmentId, please provide valid departmentId",
          "Validation Failed!"
        )
      );
    }

    // 🔹 Check Existing User
    const existingUser = await authorizedUsersModel.findById(userId);
    if (!existingUser) {
      return res
        .status(404)
        .json(Response.userFailResp("Authorized user not found"));
    }

    // 🔹 Check duplicate email
    const duplicateUser = await authorizedUsersModel.findOne({
      adminId: data?.adminId,
      _id: { $ne: userId },
      email,
    });

    if (duplicateUser) {
      return res.status(409).json(
        Response.userFailResp(
          "Another authorized user with email already exists"
        )
      );
    }

    // =====================================================
    // ✅ FIXED PROFILE IMAGE LOGIC STARTS HERE
    // =====================================================

    const existingProfilePics = existingUser.profilePics || [];

    // Clean incoming profilePics
    let newProfilePics = [];

    if (Array.isArray(req.body.profilePics)) {
      newProfilePics = req.body.profilePics.filter(Boolean);
    } else if (req.body.profilePics) {
      newProfilePics = [req.body.profilePics];
    }
      
    // Find deleted images
    const deletedProfilePics = existingProfilePics.filter(
      (pic) => !newProfilePics.includes(pic)
    );
    

    // Delete removed files
    if (deletedProfilePics.length > 0) {
      const deleteResult = await deleteFileFromStorage(
        deletedProfilePics,
        cacheDir
      );

      if (!deleteResult.success) {
        return res.send(
          Response.userFailResp(deleteResult.message, "Validation Failed!")
        );
      }
    }

    // Upload new images
    let uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      // Pooled connection held for the upload only — see createAuthUser.
      uploadedFiles = await withSFTPConnection((sftp) =>
        uploadFilesToSFTP({
          files: req.files,
          mediaType: "image",
          folderName: `${existingUser?.firstName}${existingUser?.lastName}`,
          sftp,
        })
      );
    }

    // Final clean array (retained + new uploads)
    newProfilePics = [...newProfilePics, ...uploadedFiles];

    // Always maximum 3 images
    newProfilePics = newProfilePics.slice(0, 3);

    // Require at least 1 profile image
    if (newProfilePics.length < 1) {
      return res.send(
        Response.validationFailResp(
          "At least 1 profile image is required",
          "Validation Failed!"
        )
      );
    }

    // =====================================================
    // ✅ PROFILE IMAGE LOGIC ENDS HERE
    // =====================================================

    // 🔹 Update User
    const updatedUser = await authorizedUsersModel.findByIdAndUpdate(
      userId,
      {
        firstName,
        lastName,
        email,
        profilePics: newProfilePics,
        adminId: isAdminExist?._id,
        departmentId,
        designation,
        branch,
        shiftId,
        numberPlate,
        vehicleNumber,
        location
      },
      { new: true }
    );

    // 🔹 Prepare AI Service Payload
    const payload = {
      user_id: updatedUser._id.toString(),
      firstName: updatedUser.firstName || "",
      lastName: updatedUser.lastName || "",
      email: updatedUser.email || "",
      department: updatedUser.departmentId?.departmentName || "",
      branch: updatedUser.branch || "",
      designation: updatedUser.designation || "",
      profileImages: newProfilePics.map((pic) => toMediaUrl(this.backendDomain, pic)),
      collection_name: this.getDbName(updatedUser.adminId),
      admin_id: updatedUser.adminId?.toString(),
    };

    // 🔹 Update AI Service
    try {
      const response = await axios.put(
        `${await this.getDSAuthUsersAPI(updatedUser.adminId)}/update_user_info`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: FACE_SERVICE_TIMEOUT_MS,
        }
      );

      console.log("✅ Face Auth Updated in AI service:", response.data);
    } catch (err) {
      console.error(
        "❌ Failed to Update user in Face Auth service:",
        err.response?.data?.message
      );

      if (
        err.response?.data?.message === "User already registered" ||
        err.response?.data?.message === "No valid face detected"
      ) {
        return res.status(409).json(
          Response.errorResp(
            "A user with similar facial data is already registered.",
            "Authorized user update failed."
          )
        );
      }

      // ===========================================================================
      // ✅ User not found in AI Service collection hence create them in AI Service
      // ===========================================================================

      if(err.response?.data?.message === "User not found in this collection"){
        console.log("user not found.");
        let newUser = await authorizedUsersModel.findById(userId);

          // ✅ Proceed only if user creation was successful
        if (newUser && newUser._id) {
          const payload = {
            uid: newUser._id.toString(),
            firstName: newUser.firstName || "",
            lastName: newUser.lastName || "",
            email: newUser.email || "",
            department: newUser.departmentId?.departmentName || "",
            branch: newUser.branch || "",
            designation: newUser.designation || "",
            profileImages:  newProfilePics.map((pic) => toMediaUrl(this.backendDomain, pic)),
            db: this.getDbName(newUser.adminId), // 🔹 replace with your actual DB name
            admin_id: newUser.adminId?.toString(),
          };
          try {
            
            const response = await axios.post(
              `${await this.getDSAuthUsersAPI(newUser.adminId)}/register`,
              payload,
              {
                headers: { "Content-Type": "application/json" },
                timeout: FACE_SERVICE_TIMEOUT_MS,
              }
            );
            console.log("✅ Face Auth Registered in AI service:", response.data);
            // 🔹 Mark verified true
            await authorizedUsersModel.findByIdAndUpdate(updatedUser._id, {
              verified: true,
            });

            return res.status(200).json(
              Response.userSuccessResp(
                "Authorized user updated successfully",
                updatedUser
              )
            );
          } catch (err) {
            
            console.error("❌ Failed to register user in Face Auth service:", err.response?.data?.message);
            if(err.response?.data?.message==="User already registered"||err.response?.data?.message==="No valid face detected"){
              //delete duplicated unverified user that was created
              // await authorizedUsersModel.findByIdAndDelete(newUser._id);
              
              return res
                .status(409)
                .json(
                  Response.errorResp(
                    "A user with similar facial data is already registered.",
                    "Authorized user creation failed."
                  )
                );
              }



            //Update user as unverified
            await authorizedUsersModel.findByIdAndUpdate(
              newUser._id,
              { verified: false },
              { new: true }
            );
          return res
          .status(500)
          .json(Response.errorResp(err.response?.data?.message,"Failed to create authorizedUser."));
          }
        } else {
          console.error("❌ User creation failed. Skipping Face Auth registration.");
        }
        
        
      }

    //Delete uploadedFiles if error.response?.data?.message === "Identity verification failed. Please upload a valid photo" 
    //and also find the image that was uploaded and only delete that image's from user collection
      if (err.response?.data?.message === "Identity verification failed. Please upload a valid photo") {
        await deleteFileFromStorage(
          uploadedFiles,
          cacheDir
        );
        let updateUserData = await authorizedUsersModel.findById(updatedUser._id);
        updateUserData.profilePics = updateUserData?.profilePics?.filter(
          (pic) => !uploadedFiles?.includes(pic)
        );
        await updateUserData.save();

      }

      await authorizedUsersModel.findByIdAndUpdate(updatedUser._id, {
        verified: false,
      });

      return res.status(500).json(
        Response.errorResp(
          err.response?.data?.message,
          "Failed to Update authorizedUser."
        )
      );
    }

    // 🔹 Mark verified true
    await authorizedUsersModel.findByIdAndUpdate(updatedUser._id, {
      verified: true,
    });

    return res.status(200).json(
      Response.userSuccessResp(
        "Authorized user updated successfully",
        updatedUser
      )
    );
  } catch (error) {
    logger.error(error);
    return res.status(500).json(
      Response.errorResp(
        error.response?.data?.message,
        "Failed to update authorizedUser."
      )
    );
  }
}


    async deleteAuthUser(req, res, _next) {
      try {
        const data = req?.verified?.userData;
        const { userId } = req.query;
  
        // Validate userId
        if (!userId) {
          return res
            .status(400)
            .json(Response.userFailResp("Missing userId in query", "Validation Failed!"));
        }
  
        // Check if admin exists
        const isAdminExist = await adminModel.findOne({
          user_id: data?.user_id?.toString(),
          email: data?.user_email,
        });
  
        if (!isAdminExist) {
          return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
        }
  
        // Delete authorized user from DB
        const deletedUser = await authorizedUsersModel.findByIdAndDelete(userId);
  
        if (!deletedUser) {
          return res.status(404).json(Response.userFailResp("Authorized user not found"));
        }



  
        // Define media path
        const mediaPath = decodeURIComponent(
          `/emp-cctv-dev-media/uploads/images/${deletedUser?.firstName}`
        );
        const fileName = path.basename(mediaPath);
        const cachedFilePath = path.join(cacheDir, fileName);
  
        // 🧹 Delete from local cache (if exists)
        if (fs.existsSync(cachedFilePath)) {
          const stats = fs.lstatSync(cachedFilePath);
          if (stats.isDirectory()) {
            fs.rmSync(cachedFilePath, { recursive: true, force: true });
            console.log(`Deleted local folder: ${cachedFilePath}`);
          } else {
            fs.unlinkSync(cachedFilePath);
            console.log(`Deleted local file: ${cachedFilePath}`);
          }
        }
  
        // 🌐 Connect to SFTP
        const sftp = await checkSftpConnection();

        // Check if remote path exists
        const exists = await sftp.exists(mediaPath);
        console.log("exists:", exists); // '-', 'd', or false
  
        if (exists) {
          if (exists === 'd') {
            // Directory — delete recursively
            await sftp.rmdir(mediaPath, true);
            console.log(`Deleted folder from SFTP: ${mediaPath}`);
          } else if (exists === '-') {
            // File — delete directly
            await sftp.delete(mediaPath);
            console.log(`Deleted file from SFTP: ${mediaPath}`);
          }
        }

        //Deleting User data from AI service
        try {
          const url = `${await this.getDSAuthUsersAPI(deletedUser?.adminId)}/delete?uid=${deletedUser?._id.toString()}&db=${this.getDbName(deletedUser?.adminId)}`;
        
          const response = await axios.delete(url, {
            headers: { accept: "application/json" }
          });
        
        } catch (err) {
          if (err.response) {
            console.log(`Delete failed (${err.response.status}): ${JSON.stringify(err.response.data)}`);
          } else {
            console.log("Error:", err.message);
          }
        }
        
  
        // ✅ Return success response
        return res
          .status(200)
          .json(Response.userSuccessResp("Authorized user deleted successfully", deletedUser));
  
      } catch (error) {
        logger.error(error);
        return res
          .status(500)
          .json(Response.errorResp("Failed to delete authorized user.", error.message));
      }
    }

      async authUserLogin(req, res, _next) {
        try {
          const { usernameOrEmail, password } = req.body;
      
          if (!usernameOrEmail || !password) {
            return res.status(400).json(Response.userFailResp("Missing email/username or password", "Validation Failed!"));
          }
      
          // Find the authorized user by email or userName
          const user = await authorizedUsersModel.findOne({
            $or: [{ email:usernameOrEmail }, { firstName: usernameOrEmail }]
          });

          if (!user) {
            return res.status(401).json(
              Response.userFailResp("Invalid email/username or password", "Authentication Failed!")
            );
          }

          const decryptedOldPassword = decrypt(user.password);
          
          if (password !== decryptedOldPassword) {
            return res
              .status(400)
              .json(Response.userFailResp("Password is incorrect"));
          }
          const admin = await adminModel.findById(user.adminId).select("streamHost");
          let tokenPayload = {
            userId: user._id,
            user_email: user.email,
            userName: user.userName,
            firstName: user.firstName,
            lastName: user.lastName,
            roleId: user.roleId,
            departmentId:user.departmentId,
            profilePics: user.profilePics,
            adminId:user.adminId,
            emp_id:user.emp_id,
            orgId:user.orgId,
            // Resolved RTSP stream host (parent admin's override or global default),
            // normalised to always end with a single trailing slash.
            streamHost: `${(admin?.streamHost || config.get("RTSPStream.host")).replace(/\/+$/, "")}/`,
          };

          let jwtToken = generateToken(tokenPayload, this.secretKey, this.tokenExpiryTime);
          return res.status(200).json(
            Response.userSuccessResp("Login successful", {
              token: jwtToken,
              userData:tokenPayload
            })
          );
        } catch (error) {
          logger.error(error);
          return res
            .status(500)
            .json(Response.errorResp("Failed to login.", error.message));
        }
      }

async bulkImportAuthUser(req, res, next) {
  try {
    const data = req?.verified?.userData;
    const listofUsers = req.body?.users || [];

    if (!data) {
      return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
    }

    if (!listofUsers.length) {
      return res.send(Response.userFailResp("No users found in file", "Validation Failed!"));
    }

    const errors = [];
    const validUsers = [];
    const emailSet = new Set();

    // STEP 1 : Validate fields + duplicate emails in file
    for (let i = 0; i < listofUsers.length; i++) {
      const rowNumber = i+1; // header row = 1
      const user = listofUsers[i];

      if (!user.userName) {
        errors.push({
          slNo: errors.length + 1,
          rowNo: `row ${rowNumber}`,
          error: 'Missing "userName" in record'
        });
        continue;
      }

      if (!user.firstName) {
        errors.push({
          slNo: errors.length + 1,
          rowNo: `row ${rowNumber}`,
          error: 'Missing "firstName" in record'
        });
        continue;
      }

      if (!user.lastName) {
        errors.push({
          slNo: errors.length + 1,
          rowNo: `row ${rowNumber}`,
          error: 'Missing "lastName" in record'
        });
        continue;
      }


      if (!user.email) {
        errors.push({
          slNo: errors.length + 1,
          rowNo: `row ${rowNumber}`,
          error: 'Missing "email" in record'
        });
        continue;
      }

      // duplicate email in file
      if (emailSet.has(user.email)) {
        errors.push({
          slNo: errors.length + 1,
          rowNo: `row ${rowNumber}`,
          error: `Duplicate email "${user.email}" in file`
        });
        continue;
      }

      emailSet.add(user.email);
      validUsers.push({ ...user, rowNumber });
    }

    // STEP 2 : Check duplicates in DB
    const emails = validUsers.map(u => u.email);

    const existingUsers = await authorizedUsersModel.find({
      email: { $in: emails }
    });

    const existingEmailSet = new Set(existingUsers.map(u => u.email));

    const usersToInsert = [];

    for (const user of validUsers) {
      if (existingEmailSet.has(user.email)) {
        errors.push({
          slNo: errors.length + 1,
          rowNo: `row ${user.rowNumber}`,
          error: `User already exists with email ${user.email}`
        });
        continue;
      }

      usersToInsert.push({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        adminId: data.adminId,
        verified: false
      });
    }

    // STEP 3 : If any errors return them
    if (errors.length > 0) {
      return res.send({
        success: false,
        message: "Error in File",
        errors
      });
    }

    // STEP 4 : Insert users
    await authorizedUsersModel.insertMany(usersToInsert);

    return res.send(Response.userSuccessResp("Authorized users imported successfully!"));

  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json(Response.errorResp("Failed to bulk import authorized users.", error.message));
  }
}

  async fetchUniqueLocations(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      if (!data) {
        return res.status(401).json(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }
      
      const skip = req.query.skip || 0;
      const limit = req.query.limit || 10;
      const search = req.query.search || '';
      
      const parsedSkip = parseInt(skip) || 0;
      const parsedLimit = parseInt(limit) || 10;
      
      const filter = { 
        adminId: new mongoose.Types.ObjectId(data.adminId),
        location: { $nin: [null, "", "null"] }
      };

      if (search && search.trim() !== '') {
        filter.location.$regex = new RegExp(search.trim(), 'i');
      }

      const pipeline = [
        { $match: filter },
        {
          $group: {
            _id: { $toLower: "$location" },
            location: { $first: "$location" }
          }
        },
        { $sort: { location: 1 } },
        {
          $facet: {
            metadata: [{ $count: "total" }],
            data: [{ $skip: parsedSkip }, { $limit: parsedLimit }]
          }
        }
      ];

      const results = await authorizedUsersModel.aggregate(pipeline);
      
      const totalCount = results[0]?.metadata[0]?.total || 0;
      const uniqueLocations = results[0]?.data?.map(item => item.location) || [];

      return res.status(200).json(
        Response.userSuccessResp("Unique locations fetched successfully", {
          totalCount,
          locations: uniqueLocations
        })
      );
    } catch (error) {
      logger.error(error);
      return res.status(500).json(
        Response.errorResp("Failed to fetch unique locations.", error.message)
      );
    }
  }

  async tagUser(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      let { userId } = req.query;
      const { tag, profileImages, accessLogId } = req.body;

      // Validate that either userId or accessLogId is provided
      if (!userId && !accessLogId) {
        return res.status(400).json(
          Response.userFailResp(
            "Missing required identifier",
            "Must provide either userId (query param) or accessLogId (body param)"
          )
        );
      }

      if (typeof tag !== 'boolean') {
        return res.status(400).json(Response.userFailResp("tag must be a boolean", "Validation Failed!"));
      }

      const isAdminExist = await this.resolveAdminFromVerifiedUser(data);

      if (!isAdminExist) {
        return res.status(404).json(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      // If accessLogId provided but not userId, look up userId from accessLog
      if (accessLogId && !userId) {
        const accessLog = await OptimizedAccessLogs.findById(accessLogId).select('userId');
        if (!accessLog || !accessLog.userId) {
          return res.status(404).json(
            Response.userFailResp(
              "Access log not found or has no associated user",
              "Validation Failed!"
            )
          );
        }
        userId = accessLog.userId.toString();
      }

      const isUserExist = await authorizedUsersModel.findOne({ _id: userId, adminId: isAdminExist._id });
      if (!isUserExist) {
        return res.status(404).json(Response.userFailResp("Authorized user not found", "Validation Failed!"));
      }

      // For untag, don't trust the client-supplied profileImages — when the
      // click comes from a Detected-Users-tagged row, the frontend builds
      // those URLs off VITE_BACKEND (the API host), which DS's network may
      // not reach at all in non-prod setups, and even when reachable it's
      // just a face-crop thumbnail rather than a verified reference image.
      // faceImagesModel already holds this user's actual tagged images
      // (same source Detected Users uses), so build the DS-facing URL from
      // there directly, the same way faceImages.service.js's delete flow does.
      let untagProfileImages = profileImages;
      if (!tag) {
        const imageBaseUrl = config.get("ImageView");
        const linkedImages = await faceImagesModel
          .find({ authorizedUserId: isUserExist._id })
          .select("image")
          .lean();
        if (linkedImages.length) {
          untagProfileImages = linkedImages.map((doc) => `${imageBaseUrl}${doc.image}`);
        }
      }

      // Call /tag or /untag based on tag value — only update DB if API returns success
      logger.info(`DS ${tag ? 'tag' : 'untag'} request for uid=${isUserExist._id}:`, {
        profileImages: tag ? profileImages : untagProfileImages,
      });
      let dsResponse;
      try {
        if (tag) {
          dsResponse = await axios.post(
            `${await this.getDSAuthUsersAPI(isAdminExist._id)}/tag`,
            {
              uid: isUserExist._id.toString(),
              firstName: isUserExist.firstName,
              lastName: isUserExist.lastName,
              profileImages: profileImages,
              admin_id: isAdminExist._id.toString(),
              db: this.getDbName(isAdminExist._id),
            },
            { headers: { accept: 'application/json' } }
          );
        } else {
          dsResponse = await axios.post(
            `${await this.getDSAuthUsersAPI(isAdminExist._id)}/untag`,
            {
              uid: isUserExist._id.toString(),
              firstName: isUserExist.firstName,
              lastName: isUserExist.lastName,
              profileImages: untagProfileImages,
              admin_id: isAdminExist._id.toString(),
              db: this.getDbName(isAdminExist._id),
            },
            { headers: { accept: 'application/json' } }
          );
        }
      } catch (err) {
        logger.error(`DS ${tag ? 'tag' : 'untag'} API error:`, err?.response?.data || err.message);
        const errData = err?.response?.data;
        if (errData?.status === 404 && errData?.success === false) {
          return res.status(404).json(Response.userFailResp(errData.message, "AI Service: No Match Found"));
        }
        return res.status(502).json(Response.errorResp(`Failed to ${tag ? 'tag' : 'untag'} user in AI service.`, errData?.message || err.message));
      }

      if (!dsResponse || dsResponse.status < 200 || dsResponse.status >= 300) {
        return res.status(502).json(Response.errorResp("AI service did not return a success response."));
      }

      const tagTimestamp = tag ? new Date() : null;

      const updatedUser = await authorizedUsersModel.findByIdAndUpdate(
        userId,
        { tag },
        { new: true }
      );

      if (accessLogId) {
        await OptimizedAccessLogs.findByIdAndUpdate(accessLogId, { tag, taggedAt: tagTimestamp });
      }

      // A person can be tagged via a real camera detection (OptimizedAccessLogs)
      // or via a Detected-Users folder (faceImagesModel) — Tagged Users merges
      // both. Untagging (or re-tagging) from either surface must clear/set the
      // tag everywhere this userId appears, not just the one accessLogId the
      // click happened to come from, so the person fully disappears from/
      // reappears in Tagged Users regardless of which row was acted on.
      await OptimizedAccessLogs.updateMany({ userId }, { $set: { tag, taggedAt: tagTimestamp } });
      await faceImagesModel.updateMany({ authorizedUserId: userId }, { $set: { tag, taggedAt: tagTimestamp } });

      return res.status(200).json(Response.userSuccessResp("User tag updated successfully", updatedUser));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to update user tag.", error.message));
    }
  }

  async clearAutoTaggedAccessLogs(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      const isAdminExist = await this.resolveAdminFromVerifiedUser(data);

      if (!isAdminExist) {
        return res.status(404).json(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      const manuallyTaggedUserIds = await authorizedUsersModel.distinct('_id', {
        adminId: isAdminExist._id,
        tag: true,
      });

      const cleanupQuery = {
        admin: isAdminExist._id,
        tag: true,
        $or: [
          { userId: { $exists: false } },
          { userId: null },
          { userId: { $nin: manuallyTaggedUserIds } },
        ],
      };

      const result = await OptimizedAccessLogs.updateMany(cleanupQuery, {
        $set: { tag: false, taggedAt: null },
      });

      return res.status(200).json(
        Response.userSuccessResp('Auto-tagged access logs cleared successfully', {
          matchedCount: result?.matchedCount ?? result?.n ?? 0,
          modifiedCount: result?.modifiedCount ?? result?.nModified ?? 0,
          preservedManualUsers: manuallyTaggedUserIds.length,
        })
      );
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp('Failed to clear auto-tagged access logs.', error.message));
    }
  }

  async updateUserStatus(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      const { userId } = req.query;
      const { status } = req.body;

      if (!userId) {
        return res.status(400).json(Response.userFailResp("Missing userId in query", "Validation Failed!"));
      }
      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json(Response.userFailResp("status must be 'active' or 'suspended'", "Validation Failed!"));
      }

      const isAdminExist = await this.resolveAdminFromVerifiedUser(data);
      if (!isAdminExist) {
        return res.status(404).json(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }

      const updatedUser = await authorizedUsersModel.findOneAndUpdate(
        { _id: userId, adminId: isAdminExist._id },
        { status },
        { new: true },
      );
      if (!updatedUser) {
        return res.status(404).json(Response.userFailResp("Authorized user not found", "Validation Failed!"));
      }

      return res.status(200).json(Response.userSuccessResp(
        `Authorized user ${status === 'suspended' ? 'suspended' : 'reactivated'} successfully`,
        updatedUser,
      ));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to update authorized user status.", error.message));
    }
  }

}


//Collect only one array of remotePath array
const uploadFilesToSFTP = async ({
  files,
  mediaType,
  folderName,
  sftp
}) => {
  const mainPath = config.get("SFTP.Path");
  const remoteDir = `${mainPath}/uploads/${mediaType}s/${folderName}`;

  await sftp.mkdir(remoteDir, true).catch(() => {});

  const uploadedPaths = [];

  for (const file of files) {
    const timestamp = Date.now();
    // Sanitize to URL-safe chars so stored paths need no client-side encoding —
    // spaces/parens/unicode in a filename otherwise break fetch/download URLs.
    const safeName = String(file.originalname ?? "file").replace(/[^\w.-]+/g, "_");
    const remoteFileName = `${timestamp}-${safeName}`;
    const remotePath = `${remoteDir}/${remoteFileName}`;

    const bufferStream = new stream.PassThrough();
    bufferStream.end(file.buffer);

    await sftp.put(bufferStream, remotePath);

    const relativePath = remotePath.includes("/mnt/nfs/videoraiq-media-NAS")
      ? remotePath.replace("/mnt/nfs/videoraiq-media-NAS", "")
      : remotePath;

    uploadedPaths.push(relativePath);
  }

  return uploadedPaths;
};

export const deleteFileFromStorage = async (remoteFilePaths = [], cacheDir) => {
  try {
    if (!Array.isArray(remoteFilePaths) || remoteFilePaths.length === 0) {
      throw new Error("remoteFilePaths must be a non-empty array");
    }

    const sftp = await checkSftpConnection();

    const results = [];

    for (const filePath of remoteFilePaths) {
      try {
        if (!filePath) continue;

        const decodedPath = decodeURIComponent(filePath);
        console.log(decodedPath,'decodedPath');
        
        const fileName = path.basename(decodedPath);
        const cachedFilePath = path.join(cacheDir, fileName);

        /* ==============================
           🧹 DELETE FROM LOCAL CACHE
        ============================== */
        if (fs.existsSync(cachedFilePath)) {
          const stats = fs.lstatSync(cachedFilePath);

          if (stats.isFile()) {
            fs.unlinkSync(cachedFilePath);
            console.log(`✅ Deleted local file: ${cachedFilePath}`);
          }
        }

        /* ==============================
           🌐 DELETE FROM SFTP
        ============================== */
        const exists = await sftp.exists(decodedPath);

        if (!exists) {
          results.push({
            path: decodedPath,
            success: false,
            message: "Remote file does not exist",
          });
          continue;
        }

        if (exists !== "-") {
          results.push({
            path: decodedPath,
            success: false,
            message: "Remote path is not a file",
          });
          continue;
        }

        await sftp.delete(decodedPath);
        console.log(`✅ Deleted file from SFTP: ${decodedPath}`);

        results.push({
          path: decodedPath,
          success: true,
          message: "File deleted successfully",
        });

      } catch (err) {
        console.error(`❌ Failed to delete ${filePath}:`, err.message);

        results.push({
          path: filePath,
          success: false,
          message: err.message,
        });
      }
    }

    return {
      success: true,
      total: remoteFilePaths.length,
      results,
    };

  } catch (error) {
    console.error("❌ Bulk file deletion failed:", error.message);
    throw error;
  }
};



export default new AuthUsersService();
