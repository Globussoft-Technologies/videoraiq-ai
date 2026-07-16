import logger from "../../../utils/logger.js";
import { autoSyncLocations } from "../../../utils/helperFunctions.js";
import { resolveAdminEndpoints } from "../../../utils/adminEndpoints.js";
import Response from "../../../utils/response.js";
import adminModel from "../admin/admin.model.js";
import AuthUsersValidator from "./users.validate.js"
import authorizedUsersModel from "./users.model.js";
import authorizedUsers from "../authorizedUsers/authorizedUsers.model.js"
import rolesModel from "../roles/roles.model.js";
import departmentsModel from "../departments/departments.model.js";
import path from "path";
import axios from "axios";
import {
  checkSftpConnection
} from "../../../utils/sftpConnectionCheck.js";
import stream from 'stream';
import { RolesMessageNew } from "../../../language/language.translator.js";
import { decrypt, encrypt } from "../../../utils/cryptoUtils.js";
import { generateToken } from "../../../middlewares/decodeToken.js";
import config from "config";
import nvrModel from "../NVR/nvr.model.js"
import fs from 'fs';
import channelModel from "./../channels/channels.model.js";
import MailHelper from "../../../mailService/mail.helper.js"
import {
    pipeline
} from 'stream/promises';
import {
    createWriteStream,
    createReadStream
} from 'fs';
import crypto from "crypto";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";

import NVR from "./../NVR/nvr.model.js";
import Channel from "./../channels/channels.model.js";
import departmentModel from "../departments/departments.model.js";
import mongoose from "mongoose";
import AuthService from "../Auth/auth.service.js"
import { getEmpAuthInfo, syncPermissionLocations, syncStevinrockLogPermissions } from "../../../utils/helperFunctions.js"

let cacheDir = path.join('/tmp', 'media-cache'); // You can change this to './cache' or any path

if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, {
        recursive: true
    });
}



export const importJobs = new Map();

const has = arr => Array.isArray(arr) && arr.length > 0;

// For ObjectId arrays
const uniqueObjectIds = arr =>
  [...new Set(arr.map(id => id.toString()))]
    .map(id => new mongoose.Types.ObjectId(id));

// For string locations
const uniqueStrings = arr =>
  [...new Set(arr.map(v => v?.toString().trim()).filter(Boolean))];


class UsersService {

  constructor() {
    this.secretKey = config.get("jwt.secretKey");
    this.tokenExpiryTime = config.get("jwt.tokenExpiryTime");

  }

  async fetchAuthUser(req, res, _next) {
    try {
      const data = req?.verified?.userData;
      const { userId, skip = 0, limit = 10, searchQuery = "" } = req.query;
      const sortBy = {};
      sortBy[req.query.orderBy || 'createdAt'] = req.query.sort === 'asc' ? 1 : -1;

      const { roleIds } = req.body;
  
      // ✅ Check if admin exists
      const isAdminExist = await adminModel.findOne({ _id: data?.adminId });
      if (!isAdminExist) {
        return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
      }
  
      // ✅ Fetch single user by ID
      if (userId) {
        const user = await authorizedUsersModel.findById(userId)
          .populate("roleIds", "roleName empRoleId");
  
        if (!user) {
          return res.status(200).json(
            Response.userSuccessResp("Authorized user not found", {
              totalCount: 0,
              users: [],
            })
          );
        }

        const userObj = user.toObject();
        if (userObj.password) {
          try { userObj.password = decrypt(userObj.password); } catch (_) {}
        }
  
        return res.status(200).json(
          Response.userSuccessResp("Authorized user fetched successfully", {
            totalCount: 1,
            users: [userObj],
          })
        );
      }
  
      const parsedSkip = parseInt(skip);
      const parsedLimit = parseInt(limit);
  
      // ✅ Validate provided roleIds
      if (roleIds?.length) {
        const rolesCount = await rolesModel.countDocuments({ _id: { $in: roleIds } });
        if (rolesCount !== roleIds.length) {
          return res.send(
            Response.userFailResp(
              "One or more roleIds do not exist. Please provide valid roleIds.",
              "Validation Failed!"
            )
          );
        }
      }
  
      // ✅ Added section — check if searchQuery matches any roleName
      let roleIdsFromSearch = [];
      if (searchQuery?.trim()) {
        const matchingRoles = await rolesModel.find(
          { roleName: { $regex: searchQuery, $options: "i" } },
          { _id: 1 }
        );
        if (matchingRoles?.length) {
          roleIdsFromSearch = matchingRoles.map(role => role._id);
        }
      }
  
      // ✅ Build filter dynamically
      const filter = { adminId: data?.adminId };
  
      if (roleIds?.length) {
        filter.roleIds = { $in: roleIds };
      }
  
      // ✅ Add search for userName, firstName, lastName, and roleName
      if (searchQuery?.trim()) {
        filter.$or = [
          { userName: { $regex: searchQuery, $options: "i" } },
          { firstName: { $regex: searchQuery, $options: "i" } },
          { lastName: { $regex: searchQuery, $options: "i" } },
        ];
  
        // ✅ Include users having matching roleIds
        if (roleIdsFromSearch?.length) {
          filter.$or.push({ roleIds: { $in: roleIdsFromSearch } });
        }
      }
  
      // ✅ Fetch users and count simultaneously
      const [users, totalCount] = await Promise.all([
        authorizedUsersModel
          .find(filter)
          .populate("roleIds", "roleName empRoleId")
          .collation({ locale: "en", strength: 2 })    //Sorts userNAme case Insensitively
          .sort(sortBy)
          .skip(parsedSkip)
          .limit(parsedLimit)
          .lean(),
        authorizedUsersModel.countDocuments(filter),
      ]);


      // 🔹 Collect all userIds
      const userIds = users.map(u => u._id);

      // 🔹 Fetch authorizedChannels for all users at once
      const authorizedChannelsData = await authorizedChannelsModel
        .find({ userId: { $in: userIds } }).populate("channels","name").populate("nvrIds","nvrName").populate("departmentIds","departmentName")
        .lean();

      // 🔹 Map authorizedChannels data to each user (with decrypted password)
      const usersWithChannels = users.map(user => {
        let decryptedPassword = user.password;
        if (decryptedPassword) {
          try { decryptedPassword = decrypt(decryptedPassword); } catch (_) {}
        }
        return {
          ...user,
          password: decryptedPassword,
          authorizedChannels: authorizedChannelsData.find(ac => ac.userId.toString() === user._id.toString()) || null,
        };
      });
  
      return res.status(200).json(
        Response.userSuccessResp("Authorized users fetched successfully", {
          totalCount,
          users:usersWithChannels,
        })
      );
  
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
        let { user_id, adminId ,memberId} = req?.verified?.userData;
        const {userName, firstName, lastName, email, profilePics ,roleIds,designation,branch,password,confirmPassword,authorizedChannelsData} = req.body;

        // const { error ,value} = AuthUsersValidator.createAuthUser(req?.body);

        // if(error) return res.send(Response.validationFailResp(error.message,"Validation Failed!"));

        

            // 1️⃣ Validate passwords
        if (!password || !confirmPassword) {
            return res.send(Response.userFailResp("Password and Confirm Password are required.", "Validation Failed!"));
        }
    
        if (password !== confirmPassword) {
            return res.send(Response.userFailResp("Password and Confirm Password do not match.", "Validation Failed!"));
        }
  

          // 🔹 Roles
          const validRoles = await rolesModel.find({ _id: { $in: roleIds },adminId:data?.adminId }).select("_id roleName");
          if(validRoles.length===0){
            return res.send(Response.validationFailResp("At least one valid roleId must be provided","Validation Failed!"));
          }

          const foundRoleIds = validRoles.map(r => r._id.toString());
          const invalidRoles = roleIds?.filter(id => !foundRoleIds.includes(id));


          if (invalidRoles?.length > 0) {
            let employeeRole = await rolesModel.findOne({roleName:"read",adminId:data?.adminId}).select("_id roleName");
            foundRoleIds.push(employeeRole._id.toString());
            // return res.send(Response.validationFailResp("Invalid roleId, please provide valid roleId","Validation Failed!"));
          }
    



        // Check if admin is valid
        const isAdminExist = await adminModel.findOne({
         _id: data?.adminId,
        });
    
        if (!isAdminExist) {
          return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
        }
    

    
        // Check if any user exists  email
        const duplicateUser = await authorizedUsersModel.findOne(
            { email, adminId:data?.adminId },
        );

        
        const userWithSameUserName = await authorizedUsersModel.findOne(
            { userName, adminId:data?.adminId },
          
        );
        
    
        if (duplicateUser) {
            return res.send(Response.userFailResp(
            `An authorized user with the email ${email} already exists.`
            ));
        }
        if(userWithSameUserName){
            return res.send(Response.userFailResp(
            `An authorized user with the userName ${userName} already exists.`
            ));
        }
        
        //Checking if the role is biometric
        if(validRoles?.[0]?.roleName !== "biometric"){

          let authorizedChannels
  
          if(authorizedChannelsData && !Object.keys(authorizedChannelsData).length>0){
            return res.send(Response.userFailResp("Authorized Channels data is missing", "Validation Failed!"));
          }
  
          if(!authorizedChannelsData){
            return res.send(Response.userFailResp("Authorized Channels data is missing", "Validation Failed!"));
          }
          if(authorizedChannelsData && (!authorizedChannelsData.locations || !authorizedChannelsData.nvrIds || !authorizedChannelsData.departmentIds || !authorizedChannelsData.channelIds)){
            return res.send(Response.userFailResp("Incomplete Authorized Channels data", "Validation Failed!"));
          }
  
          if(authorizedChannelsData && ( !Array.isArray(authorizedChannelsData.locations) || !Array.isArray(authorizedChannelsData.nvrIds) || !Array.isArray(authorizedChannelsData.departmentIds) || !Array.isArray(authorizedChannelsData.channelIds))){
            return res.send(Response.userFailResp("Authorized Channels data should be in array format", "Validation Failed!"));
          }
  
          // //making Locations mandatory
          // if(authorizedChannelsData && (authorizedChannelsData.locations.length)){
          //     let Locations = await nvrModel.find({ location:{$in:authorizedChannelsData?.locations} }).select(
          //         "_id location"
          //     );
          //       if(!Locations.length){
          //         return res.send(Response.userFailResp("No NVRs found for the provided locations", "Validation Failed!"));
          //       }
          // }
  
          //making validations for nvrIds as mandatory
        if(authorizedChannelsData && authorizedChannelsData?.nvrIds?.length>0){
              const nvrCount = await nvrModel.countDocuments({ _id: { $in: authorizedChannelsData.nvrIds } });
              if (nvrCount !== authorizedChannelsData?.nvrIds?.length) {
                return res.send(Response.userFailResp("One or more nvrIds are invalid", "Validation Failed!"));
              }
          }

  
  
          //making nvr or department as mandatory
          if (
            authorizedChannelsData &&
            (
              (authorizedChannelsData.nvrIds && authorizedChannelsData.nvrIds.length > 0) ||
              (authorizedChannelsData.departmentIds && authorizedChannelsData.departmentIds.length > 0)
            )
          ) {
            if(authorizedChannelsData.nvrIds && authorizedChannelsData.nvrIds.length > 0){
              const nvrCount = await nvrModel.countDocuments({ _id: { $in: authorizedChannelsData.nvrIds } });
              if (nvrCount !== authorizedChannelsData.nvrIds.length) {
                return res.send(Response.userFailResp("One or more nvrIds are invalid", "Validation Failed!"));
              }
            }
            if(authorizedChannelsData.departmentIds && authorizedChannelsData.departmentIds.length > 0){
              const departmentCount = await departmentsModel.countDocuments({ _id: { $in: authorizedChannelsData.departmentIds } });
              if (departmentCount !== authorizedChannelsData.departmentIds.length) {
                return res.send(Response.userFailResp("One or more departmentIds are invalid", "Validation Failed!"));
              }
            }
            
          }

  
          if(authorizedChannelsData && authorizedChannelsData.channelIds.length>0){
            const totalChannels = authorizedChannelsData.channelIds.length;
            const channelIdsCount = await channelModel.countDocuments({ _id: { $in: authorizedChannelsData.channelIds } });
            if (channelIdsCount !== totalChannels) {
              return res.send(Response.userFailResp("One or more channelIds are invalid", "Validation Failed!"));
            }
          }
  
  
          // Create the authorized user
          const newUser = await authorizedUsersModel.create({
            adminId: isAdminExist._id,
            userName,
            firstName,
            lastName,
            roleIds: foundRoleIds[0],
            email,
            profilePics,
            designation,
            branch,
            password
          });
          
          // If authorizedChannelsData is provided, create authorizedChannels document  
          // if(authorizedChannelsData && Object.keys(authorizedChannelsData).length>0){
              //Two Option Selection
              //If all the Options are selected
              let updatedAuthorizedChannelsData = {};
              // if (
              //   has(authorizedChannelsData.locations) &&
              //   has(authorizedChannelsData.nvrIds) &&
              //   has(authorizedChannelsData.channelIds) &&
              //   has(authorizedChannelsData.departmentIds)
              // ){
                authorizedChannelsData.locations = uniqueStrings(
                  authorizedChannelsData.locations
                );
  
                authorizedChannelsData.nvrIds = uniqueObjectIds(
                  authorizedChannelsData.nvrIds
                );
  
                authorizedChannelsData.channelIds = uniqueObjectIds(
                  authorizedChannelsData.channelIds
                );
  
                authorizedChannelsData.departmentIds = uniqueObjectIds(
                  authorizedChannelsData.departmentIds
                );
  
                updatedAuthorizedChannelsData.locations = authorizedChannelsData.locations;
                updatedAuthorizedChannelsData.nvrIds = authorizedChannelsData.nvrIds;
                updatedAuthorizedChannelsData.channelIds = authorizedChannelsData.channelIds;
                updatedAuthorizedChannelsData.departmentIds = authorizedChannelsData.departmentIds;
                updatedAuthorizedChannelsData.employeeLocations = authorizedChannelsData.employeeLocations;
              // }
              // else{
              //   //If some Options are selected
              //   updatedAuthorizedChannelsData = await resolveAuthorizedChannels(user_id, memberId, authorizedChannelsData)
              // }
  
             authorizedChannels = await authorizedChannelsModel.create({
              adminId: isAdminExist._id,
              userId: newUser._id,
              locations:updatedAuthorizedChannelsData.locations,
              nvrIds:updatedAuthorizedChannelsData.nvrIds,
              departmentIds:updatedAuthorizedChannelsData.departmentIds,
              channels:updatedAuthorizedChannelsData.channelIds,
              employeeLocations:updatedAuthorizedChannelsData.employeeLocations,
            });
          // }
          return res.status(201).json(
            Response.userSuccessResp("Authorized user created successfully", {newUser,authorizedChannels})
          );
        }else{
          
          //If the role is biometric
          // Create the authorized user
          const newUser = await authorizedUsersModel.create({
            adminId: isAdminExist._id,
            userName,
            firstName,
            lastName,
            roleIds: foundRoleIds[0],
            email,
            profilePics,
            designation,
            branch,
            password
          });
          let authorizedChannels = await authorizedChannelsModel.create({
              adminId: isAdminExist._id,
              userId: newUser._id,
              locations:[],
              nvrIds:[],
              departmentIds:[],
              channels:[]
            });
          return res.status(201).json(
            Response.userSuccessResp("Authorized user created successfully", {newUser,authorizedChannels})
          );
        }

    
      } catch (error) {        
        logger.error(error);
        return res
          .status(500)
          .json(Response.errorResp("Failed to create authorizedUser.", error.message));
      }
    }

    async updateAuthUser(req, res, _next) {
        try {
          const data = req?.verified?.userData;
           let { user_id, adminId ,memberId} = req?.verified?.userData;
          const { userId } = req.query;
          const { firstName, lastName, email, profilePics ,roleIds, userName,authorizedChannelsData,password} = req.body;
      
          if (!userId) {
            return res.status(400).json(Response.userFailResp("Missing userId in query"));
          }
      
          
          // Check if admin is valid
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId,
          });


          // const { error } = AuthUsersValidator.updateAuthUser(req.body);
          // if (error) {
          //   return res.send(Response.validationFailResp(error.message, "Validation Failed!"));
          // }


          // 🔹 Roles
          const validRoles = await rolesModel.find({ _id: { $in: roleIds } }).select("_id");

          const foundRoleIds = validRoles.map(r => r._id.toString());
          const invalidRoles = roleIds?.filter(id => !foundRoleIds.includes(id));
      
          if (invalidRoles?.length > 0) {
            return res.send(Response.validationFailResp("Invalid roleId, please provide valid roleId","Validation Failed!"));
          }



      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Check if the user to update exists
          const existingUser = await authorizedUsersModel.findById(userId);
          if (!existingUser) {
            return res.status(404).json(Response.userFailResp("Authorized user not found"));
          }
      
          // Check if another user already has the same firstName, lastName, and email
          const duplicateUser = await authorizedUsersModel.findOne({
            _id: { $ne: userId }, // Exclude current user
            email,
          });
      
          if (duplicateUser) {
            return res.status(409).json(Response.userFailResp(
              "Another authorized user with email already exists"
            ));
          }
          let dataToUpdate = { userName,firstName, lastName, email, profilePics ,adminId:isAdminExist?._id,roleIds};

          // 🔹 Password update: only update if a new (plain-text) password is provided
          let newPlainPassword = null; // track for email notification
          if (password?.trim()) {
            // Decrypt stored password to compare against the incoming plain-text value
            let storedPlainPassword = null;
            try { storedPlainPassword = decrypt(existingUser?.password); } catch (_) {}

            if (storedPlainPassword !== null && password.trim() === storedPlainPassword) {
              // Same password — skip update
            } else {
              // Different password — encrypt the new plain-text value and include in update
              dataToUpdate.password = encrypt(password.trim());
              newPlainPassword = password.trim();
            }
          }

      
          // Perform the update
          const updatedUser = await authorizedUsersModel.findByIdAndUpdate(
            userId,
            dataToUpdate,
            { new: true }
          );

          // 📧 Send password-updated email if password was changed
          if (newPlainPassword && updatedUser?.email) {
            MailHelper.sendPasswordUpdatedEmail(
              updatedUser.email,
              updatedUser.userName || `${updatedUser.firstName} ${updatedUser.lastName}`,
              updatedUser.email,
              newPlainPassword
            ).catch(err => logger.error(`Password update email failed: ${err.message}`));
          }

          let authorizedChannels;

          if (authorizedChannelsData && Object.keys(authorizedChannelsData).length > 0) {
                    // If authorizedChannelsData is provided, create authorizedChannels document  
        if(authorizedChannelsData && Object.keys(authorizedChannelsData).length>0){
            // ✅ Validation: at least one location
            // if (authorizedChannelsData?.locations?.length===0) {
            //   return res.send(Response.userFailResp("At least one location must be selected", "Validation Failed!"));
            // }

          // ✅ Validation: At least one from either NVR or Department must be selected
          const hasNvr =
            Array.isArray(authorizedChannelsData?.nvrIds) &&
            authorizedChannelsData.nvrIds.length > 0;

          const hasDepartment =
            Array.isArray(authorizedChannelsData?.departmentIds) &&
            authorizedChannelsData.departmentIds.length > 0;

          // if (!hasNvr) {
          //   return res.send(
          //     Response.userFailResp(
          //       "At least one NVR must be selected to assign channels",
          //       "Validation Failed!"
          //     )
          //   );
          // }


            // // ✅ Validation: at least one channel
            // if (authorizedChannelsData?.channelIds?.length===0) {
            //   return res.send(Response.userFailResp("At least one channel must be selected", "Validation Failed!"));
            // }


            const { locations, nvrIds, departmentIds, channelIds ,employeeLocations} = authorizedChannelsData;
            // ✅ At least ONE filter must have data
            const hasAtLeastOneFilter =
              (Array.isArray(locations) && locations.length > 0) ||
              (Array.isArray(nvrIds) && nvrIds.length > 0) ||
              (Array.isArray(departmentIds) && departmentIds.length > 0) ||
              (Array.isArray(channelIds) && channelIds.length > 0) ||
              (Array.isArray(employeeLocations) && employeeLocations.length > 0);

            // if (!hasAtLeastOneFilter) {
            //   return res.send(
            //     Response.userFailResp(
            //       "At least one filter (Location, NVR, Department, or Channel) must be selected",
            //       "Validation Failed!"
            //     )
            //   );
            // }

            // if(authorizedChannelsData.locations.length===1&&authorizedChannelsData.nvrIds.length===0&&authorizedChannelsData.departmentIds.length===0&&authorizedChannelsData.channelIds.length===0){
            //   let fetchByLocation = await fetchNVRsByLocation(user_id,authorizedChannelsData.locations,data?.memberId);
            //   authorizedChannelsData.nvrIds = fetchByLocation.map(d=>d._id);

            //   let authorizedDepartments = await fetchDepartmentsByLocation(user_id,authorizedChannelsData.locations,data?.memberId);
            //   authorizedChannelsData.departmentIds = authorizedDepartments.map(d=>d._id);

            //  let channelByLocation = await fetchChannelsByLocation(user_id, authorizedChannelsData.locations,memberId,"");
            //   authorizedChannelsData.channelIds = channelByLocation.map(d=>d._id);

            // }
            // else if(authorizedChannelsData.locations.length===0&&authorizedChannelsData.nvrIds.length===1&&authorizedChannelsData.departmentIds.length===0&&authorizedChannelsData.channelIds.length===0){
            //   let fetchLOCByNvr = await fetchLocationsByNVRs(user_id,authorizedChannelsData.nvrIds,memberId);
            //   authorizedChannelsData.locations = fetchLOCByNvr;

            //   let fetchDeptByNVR = await fetchDepartmentsByNVRs(user_id,authorizedChannelsData.nvrIds,memberId);
            //   authorizedChannelsData.departmentIds = fetchDeptByNVR.map(d=>d._id);


            //  let channelByNVRIds = await fetchChannelsByNVRIds(user_id, authorizedChannelsData.nvrIds,memberId,"");
            //   authorizedChannelsData.channelIds = channelByNVRIds.map(d=>d._id);

            // }
            // else if(authorizedChannelsData.locations.length===0&&authorizedChannelsData.nvrIds.length===0&&authorizedChannelsData.departmentIds.length===1&&authorizedChannelsData.channelIds.length===0){
            //  let fetchByDept = await fetchLocationsByDepartment(user_id, authorizedChannelsData.departmentIds,memberId);
            //   authorizedChannelsData.locations = fetchByDept;

            //  let fetchNvrByDept = await fetchNVRByDepartment(user_id,authorizedChannelsData.departmentIds,memberId);
            //   authorizedChannelsData.nvrIds = fetchNvrByDept.map(d=>d._id);


            //   let fetchChannelsByDept = await fetchChannelsByDepartment(user_id, authorizedChannelsData.departmentIds,memberId,"");
            //   authorizedChannelsData.channelIds = fetchChannelsByDept.map(d=>d._id)


            // }
            // else if(authorizedChannelsData.locations.length===0&&authorizedChannelsData.nvrIds.length===0&&authorizedChannelsData.departmentIds.length===0&&authorizedChannelsData.channelIds.length===1){
            //   let fetchByChannel = await fetchLocationsByChannels(user_id,authorizedChannelsData.channelIds,memberId);
            //   authorizedChannelsData.locations = fetchByChannel;

            //   let fetchNvrByChannel = await fetchNVRByChannels(user_id,authorizedChannelsData.channelIds,memberId);
            //   authorizedChannelsData.nvrIds = fetchNvrByChannel.map(d=>d._id);

            //   let fetchDeptByChannelIds = await fetchDepartmentsByChannels(user_id,authorizedChannelsData.channelIds,memberId);
            //   authorizedChannelsData.departmentIds = fetchDeptByChannelIds.map(d=>d._id);

            // }


            //If all the Options are selected
            let updatedAuthorizedChannelsData = {};
            // if (
            //   has(authorizedChannelsData.locations) &&
            //   has(authorizedChannelsData.nvrIds) &&
            //   has(authorizedChannelsData.channelIds) &&
            //   has(authorizedChannelsData.departmentIds)
            // ){
              authorizedChannelsData.locations = uniqueStrings(
                authorizedChannelsData.locations
              );

              authorizedChannelsData.nvrIds = uniqueObjectIds(
                authorizedChannelsData.nvrIds
              );

              authorizedChannelsData.channelIds = uniqueObjectIds(
                authorizedChannelsData.channelIds
              );

              authorizedChannelsData.departmentIds = uniqueObjectIds(
                authorizedChannelsData.departmentIds
              );

              updatedAuthorizedChannelsData.locations = authorizedChannelsData.locations;
              updatedAuthorizedChannelsData.nvrIds = authorizedChannelsData.nvrIds;
              updatedAuthorizedChannelsData.channelIds = authorizedChannelsData.channelIds;
              updatedAuthorizedChannelsData.departmentIds = authorizedChannelsData.departmentIds;
              updatedAuthorizedChannelsData.employeeLocations = authorizedChannelsData.employeeLocations;
              
            // }
            // else{
            //   //If some Options are selected
            //   updatedAuthorizedChannelsData = await resolveAuthorizedChannels(user_id, memberId, authorizedChannelsData)
            // }





            authorizedChannels = await authorizedChannelsModel.findOneAndUpdate(
              { userId: updatedUser._id }, // 🔹 filter condition
              {
                $set: {
                  locations: updatedAuthorizedChannelsData.locations,
                  nvrIds: updatedAuthorizedChannelsData.nvrIds,
                  departmentIds: updatedAuthorizedChannelsData.departmentIds,
                  channels: updatedAuthorizedChannelsData.channelIds, // assuming this matches your schema
                  employeeLocations: updatedAuthorizedChannelsData.employeeLocations
                },
              },
              { new: true, upsert: true } // 🔹 return updated doc, create if not exist
            );
          }
        }
          
      
          return res.status(200).json(
            Response.userSuccessResp("Authorized user updated successfully", {updatedUser,authorizedChannels})
          );
      
        } catch (error) {
          logger.error(error);
          console.log(error);
          
          return res
            .status(500)
            .json(Response.errorResp("Failed to update authorizedUser.", error.message));
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
          _id: data?.adminId,
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
          const url = `https://face-auth-cctv.poweradspy.ai/delete/${deletedUser?._id.toString()}`;
        
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
            $or: [{ email:usernameOrEmail }, { userName: usernameOrEmail }]
          }).populate("roleIds","role empRoleId").populate("adminId","user_id");

          if(!user){
            return res.status(400).json(
              Response.userFailResp("Invalid email/username or password", "Authentication Failed!")
            );
          }

          if(user?.active === false){
            return res.status(403).json(Response.userFailResp("User account is deactivated. Please contact administrator.", "Validation Failed!"));
          }
          const decryptedOldPassword = decrypt(user?.password);
          
          if (password !== decryptedOldPassword) {
            return res
              .status(400)
              .json(Response.userFailResp("Password is incorrect"));
          }
          const admin = await adminModel.findById(user.adminId?._id).select("user_id streamHost");

          const allsubscriptions = await AuthService.getAmemberAccessByUserId(parseInt(admin?.user_id))
          const formattedSubscriptions = AuthService.extractSubscriptions(allsubscriptions)

          if (user?._id) {
             await authorizedUsersModel.updateOne(
               { _id: user._id, logsSound: { $exists: false } },
               { $set: { logsSound: false } }
             );
          }
          
          
          const tokenPayload = {
            status: true,
            user_id: Number(user?.adminId?.user_id),
            login: user.userName,
            adminId:user.adminId?._id,
            orgId:user.orgId,
            user_name: user.userName,
            user_email: user.email,
            name_f: user.firstName,
            name_l: user.lastName,
            roleId: user?.roleIds,
            emp_id:user.emp_id,
            profilePics: user.profilePics,
            created_from: 'EMP',
            enablePhoneRecipients:config.get('enablePhoneRecipients'),
            memberId:user?._id,
            userSubscriptionType: formattedSubscriptions,
            // Resolved RTSP stream host (parent admin's override or global default),
            // normalised to always end with a single trailing slash.
            streamHost: `${(admin?.streamHost || config.get('RTSPStream.host')).replace(/\/+$/, "")}/`,
          };

          let jwtToken = generateToken(tokenPayload, this.secretKey, this.tokenExpiryTime);
          
          await syncPermissionLocations(user.adminId?._id);
          await syncStevinrockLogPermissions(user.adminId?._id);

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


      async bulkDeleteAuthUser(req, res, _next) {
        try {
          const data = req?.verified?.userData;
          const { userIds } = req.body;
    
          if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json(Response.userFailResp("userIds must be a non-empty array", "Validation Failed!"));
          }
    
          // Check if admin exists
          const isAdminExist = await adminModel.findOne({
            _id: data?.adminId,
          });
    
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
    
          // Delete authorized users from DB
          const deleteResult = await authorizedUsersModel.deleteMany({ _id: { $in: userIds } });
    
          return res.status(200).json(
            Response.userSuccessResp("Authorized users deleted successfully", { deletedCount: deleteResult.deletedCount })
          );
    
        } catch (error) {
          logger.error(error);
          return res
            .status(500)
            .json(Response.errorResp("Failed to bulk delete authorized users.", error.message));
        }
      }

      async forgotPassword(req, res) {
        try {
          const { email } = req.body;

          if (!email) {
            return res.status(400).json(Response.userFailResp("Email is required", "Validation Failed!"));
          }

          // Find user by email
          const user = await authorizedUsersModel.findOne({ email });
          if (!user) {
            return res.status(404).json(Response.userFailResp("User not found"));
          }

          // Generate secure reset token
          const resetToken = crypto.randomBytes(32).toString("hex");
          const tokenExpiry = Date.now() + 15 * 60 * 1000; // 15 mins validity

          user.resetPasswordToken = resetToken;
          user.resetPasswordExpires = tokenExpiry;
          await user.save();

          // Build reset link (frontend will handle the reset page)
          let baseUrl = "http://localhost:3000";
          try {
            baseUrl = config.get("frontend.baseUrl");
          } catch (e) {
            // Config property not defined, use default
          }
          const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

          // TODO: You can send email here using your mail service
          try {
            if (MailHelper?.sendForgotPasswordEmail) {
              await MailHelper.sendForgotPasswordEmail(user?.email, user?.firstName + " " + user?.lastName, resetLink);
            }
          } catch (emailError) {
            // Email sending failed, but password reset was generated successfully
            logger.warn("Failed to send forgot password email:", emailError.message);
          }

          return res.status(200).json(
            Response.userSuccessResp("Password reset link generated successfully", {
              resetToken,
              expiresIn: "15 minutes",
              resetLink
            })
          );
        } catch (error) {
          logger.error(error);
          return res.status(500).json(Response.errorResp("Failed to generate reset token", error.message));
        }
      }

      async resetPassword(req, res) {
        try {
          const { token, newPassword, confirmPassword } = req.body;

          if (!token || !newPassword || !confirmPassword) {
            return res.status(400).json(Response.userFailResp("Missing token or passwords", "Validation Failed!"));
          }

          if (newPassword !== confirmPassword) {
            return res.status(400).json(Response.userFailResp("Passwords do not match", "Validation Failed!"));
          }

          // Find user by reset token
          const user = await authorizedUsersModel.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }, // not expired
          });

          if (!user) {
            return res.send(Response.userFailResp("Invalid or expired token", "Validation Failed!"));
          }

          // Update password (will auto-encrypt due to pre-save hook)
          user.password = newPassword;
          user.resetPasswordToken = null;
          user.resetPasswordExpires = null;

          await user.save();

          return res.status(200).json(Response.userSuccessResp("Password reset successfully"));
        } catch (error) {
          logger.error(error);
          return res.status(500).json(Response.errorResp("Failed to reset password", error.message));
        }
      }

      async changePassword(req, res) {
        try {
          const data = req?.verified?.userData;
          const { currentPassword, newPassword, confirmPassword } = req.body;

          if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json(Response.userFailResp("Missing passwords", "Validation Failed!"));
          }

          if (newPassword !== confirmPassword) {
            return res.status(400).json(Response.userFailResp("New passwords do not match", "Validation Failed!"));
          }

          // Find user by ID
          const user = await authorizedUsersModel.findById(data?.memberId);
          if (!user) {
            return res.status(404).json(Response.userFailResp("User not found"));
          }

          const decryptedOldPassword = decrypt(user?.password);
          if (currentPassword !== decryptedOldPassword) {
            return res.status(400).json(Response.userFailResp("Current password is incorrect"));
          }

          // Update password (will auto-encrypt due to pre-save hook)
          user.password = newPassword;
          await user.save();

          return res.status(200).json(Response.userSuccessResp("Password changed successfully"));
        } catch (error) {
          logger.error(error);
          return res.status(500).json(Response.errorResp("Failed to change password", error.message));
        }
      }

      async checkEmpAdmin(req, res, next) {
        try {
          const { email } = req.body;
          if (!email) {
            return res.status(400).json(Response.userFailResp("Missing email in request body", "Validation Failed!"));
          }

          const data = await getEmpAuthInfo(email);

          if (data && data.data?.length) {
            return res.status(200).json(Response.userSuccessResp("User is an EMP Admin", { isEmpAdmin: true, empData: data.data }));
          } else {
            return res.status(200).json(Response.userSuccessResp("User is not an EMP Admin", { isEmpAdmin: false }));
          }
        } catch (error) {
          logger.error(error);
          return res.status(500).json(Response.errorResp("Failed to check EMP Admin status", error.message));
        }
      }

      async isEmailExist(req, res, next) {
        try {
          const { email } = req.query;
          if (!email) {
            return res.status(400).json(Response.userFailResp("Missing email in query", "Validation Failed!"));
          }

          const user = await authorizedUsers.findOne({email});
          

          if (user) {
            return res.status(200).json(Response.userSuccessResp("Email exists", { exists: true }));
          } else {
            return res.status(200).json(Response.userSuccessResp("Email does not exist", { exists: false }));
          }
        } catch (error) {
          logger.error(error);
          return res.status(500).json(Response.errorResp("Failed to check email existence", error.message));
        }
      }    

    async allOrgEmployee(req, res){
        try{
            const result = req.verified;
            let { adminId } = result?.userData;
            const skip = req.body.skip;
            const limit = req.body.limit;
            const name = req.body.name;
            let location = req.body.location;
            let orgIdFilter = req.body.orgId;
            let location_id = Number(req.body.location_id);

            // Collect all orgIds from empData
            const adminData = await adminModel.findById(adminId).select('empData');
            if (!adminData) {
                return res.send(Response.FailResp('Admin not found'));
            }


            let fetchEmployeeUniqueOrgIdFromLocation = await authorizedUsers.find({ adminId , location }).select({ orgId: 1 });
            let locationOrgIds = fetchEmployeeUniqueOrgIdFromLocation.map(emp => emp.orgId).filter(orgId => orgId);
            //remove duplicates from locationOrgIds
            locationOrgIds = [...new Set(locationOrgIds)];

            const organization_ids = [...new Set(
                adminData.empData
                    ?.filter(emp => emp.orgId)
                    .map(emp => Number(emp.orgId))
            )];

            if (organization_ids.length === 0) {
                return res.send(Response.FailResp('No organizations found for this admin'));
            }

            //If locationOrgIds there then filter organization_ids with locationOrgIds
            let finalOrgIds = organization_ids;
            if (locationOrgIds.length > 0) {
              
                finalOrgIds = locationOrgIds.filter(orgId => organization_ids.includes(Number(orgId)));
            }

            //If orgIdFilter is there then filter finalOrgIds with orgIdFilter
            if (orgIdFilter) {
                finalOrgIds = finalOrgIds.filter(orgId => Number(orgId) === Number(orgIdFilter));
            }
            //Add location_ids only if its not null 
            const body = {
                secretKey: config.get('emp_secret_key'),
                organization_ids: finalOrgIds,
                ...(location_id && { location_id }), 
                skip,
                limit,
                ...(name && { name })
            };            

            const response = await axios.post(config.get('empDomain') + 'user/fieldAllEmployeeListMultiOrg', body);

            if (response?.data) {
                let empOrgDataArray = response.data.data?.users;

                const isUserExist = await authorizedUsers.find({ adminId }).select({ emp_id: 1, email: 1 });
                const userEmpIdArray = isUserExist?.map(obj => obj['emp_id']).filter(Boolean);
                const userEmailArray = isUserExist?.map(obj => obj['email']).filter(Boolean);

                for (let i = 0; i < empOrgDataArray?.length; i++) {
                    empOrgDataArray[i].importedStatus = userEmpIdArray.includes(empOrgDataArray[i].id) || userEmailArray.includes(empOrgDataArray[i].email);
                }
                let count = response.data.data?.count || 0;

                return res.send(Response.SuccessResp('Employee List Fetched Successfully', {empOrgDataArray, count}));
            } else {
                return res.send(Response.FailResp('Something went wrong'));
            }
        }
        catch(err){
            res.send(Response.FailResp(`Something Went Wrong in function allOrgEmployee`, err));
        }
    }




async importUsers(req, res) {
  try {
    const result = req.verified;
    const { orgId, adminId } = result?.userData;

    const userData = req?.body?.usersData;

    if (!Array.isArray(userData) || userData.length === 0) {
      return res.status(400).json(
        Response.FailResp("Please select at least one employee to import.")
      );
    }

    // ❌ Validate emails
    const usersWithoutEmail = userData
      .filter(user => !user.email)
      .map(user => user.full_name || user.first_name || "Unknown User");

    if (usersWithoutEmail.length > 0) {
      const msg =
        usersWithoutEmail.length > 2
          ? `Cannot proceed. There are ${usersWithoutEmail.length} users missing an email address.`
          : `Cannot proceed. Missing email for: ${usersWithoutEmail.join(", ")}`;

      return res.status(400).json(Response.userFailResp(msg));
    }

    // ✅ Initialize job
    importJobs.set(adminId, {
      adminId,
      totalUsers: userData.length,
      processedUsers: 0,
      imported: 0,
      skipped: 0,
      failedUsers: [],
      percentage: 0,
      status: "In Progress",
    });

    // ✅ Fetch role ONCE
    const employeeRole = await rolesModel
      .findOne({ roleName: "read", adminId })
      .select("_id roleName");

    if (!employeeRole) {
      return res.status(400).json(
        Response.userFailResp("Role 'read' not found. Cannot import users.")
      );
    }
    // //remove email index from authorizedUsers collection to avoid duplicate key error during upsert
    // await authorizedUsers.collection.dropIndex("email_1");
    const runImport = async () => {
      const job = importJobs.get(adminId);

      for (const user of userData) {
        try {
          let {
            full_name: fullName,
            phone,
            first_name,
            last_name,
            email,
            address: address1,
            department,
            department_id,
            location,
            location_id,
            timezone,
            role,
            role_id,
            password,
          } = user;

          const userOrgId = user.organization_id?.toString();
          const emp_id = user.id?.toString();
          const phoneNumber = phone ? phone.replace("-", "") : "";

          // =======================
          // Department handling
          // =======================
          let departmentId;
          const deptToStore = department?.toLowerCase();

          let dept = await retryOperation(() =>
            departmentsModel.findOneAndUpdate(
              {
                adminId,
                departmentName: {
                  $regex: new RegExp(`^${department}$`, "i"),
                },
              },
              {
                departmentName: deptToStore,
                empDepartmentId: department_id,
                isImportedFromEMP: true,
              },
              { new: true }
            )
          );

          if (!dept) {
            dept = await retryOperation(() =>
              departmentsModel.create({
                adminId,
                departmentName: deptToStore,
                empDepartmentId: department_id,
                isImportedFromEMP: true,
              })
            );
          }

          departmentId = dept?._id?.toString();

          // =======================
          // ✅ UPSERT USER (FIXED)
          // =======================
          const emp = {
            userName: fullName,
            firstName: first_name,
            lastName: last_name,
            adminId,
            email,
            roleIds: employeeRole._id.toString(),
            phoneNumber,
            address1,
            orgId: userOrgId,
            emp_id,
            timezone,
            password,
            verified: false,
            departmentId,
            location: location ? location.toLowerCase() : "",
            designation: role,
            empRoleId: role_id,
            locationId: location_id,
          };

          const result = await retryOperation(() =>
            authorizedUsers.updateOne(
              { adminId,email }, // unique key
              { $setOnInsert: emp },
              { upsert: true }
            )
          );

          if (result.upsertedCount === 1) {
            job.imported++; // new user
          } else {
          job.failedUsers.push({
            email: user.email,
            reason: "User already exists, skipping import.",
          });
            job.skipped++; // already exists / retry case
          }

        } catch (err) {
          console.error("❌ Import Error:", err.message);

          job.skipped++;
          job.failedUsers.push({
            email: user.email,
            reason: err.message,
          });
        }

        // ✅ Progress update
        job.processedUsers++;
        job.percentage = Math.round(
          (job.processedUsers / job.totalUsers) * 100
        );
      }

      // ✅ Final status
      job.status =
        job.failedUsers.length > 0
          ? "Completed with Errors"
          : "Completed";

      // ✅ Background sync
      autoSyncLocations(
        { _id: adminId },
        result?.userData
      ).catch(e =>
        logger.error("Failed to sync locations post-import", e)
      );
    };

    // 🚀 Fire and forget
    runImport().catch(err => {
      logger.error(err);
      if (importJobs.has(adminId)) {
        importJobs.get(adminId).status = "Failed";
      }
    });

    return res.status(200).json(
      Response.userSuccessResp("Users import started.", { adminId })
    );

  } catch (err) {
    logger.error(err);
    return res
      .status(500)
      .json(Response.errorResp("Something went wrong", err.message));
  }
}

    async getImportProgress(req, res, next) {
        try {
            const adminId = req?.verified?.userData?.adminId;
            if (!adminId) {
                return res.status(400).json(Response.userFailResp("adminId is required from verified token.", "Validation Failed!"));
            }
            const job = importJobs.get(adminId);
            if (!job) {
                return res.status(400).json(Response.userFailResp("No import job found for your admin session.", "Not Found"));
            }
            return res.status(200).json(Response.userSuccessResp("Import progress fetched.", job));
        } catch (error) {
            logger.error(error);
            return res.status(500).json(Response.errorResp('Something went wrong fetching import progress', error.message));
        }
    }

}

const retryOperation = async (fn, retries = 5, delay = 700) => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(res => setTimeout(res, delay));
    return retryOperation(fn, retries - 1, delay);
  }
};

async function resolveAuthorizedChannels(
  user_id,
  memberId,
  authorizedChannelsData
) {

  // // Ensure defaults
  // authorizedChannelsData.locations ??= [];
  // authorizedChannelsData.nvrIds ??= [];
  // authorizedChannelsData.channelIds ??= [];
  // authorizedChannelsData.departmentIds ??= [];

  /* =========================
     1️⃣ RESOLVE LOCATIONS (STRING)
     ========================= */     
  if (!has(authorizedChannelsData.locations)) {
    let locations = [];

    if (has(authorizedChannelsData.nvrIds)) {
      locations = await fetchLocationsByNVRs(
        user_id,
        authorizedChannelsData.nvrIds,
        memberId
      );
    } 
    else if (has(authorizedChannelsData.channelIds)) {
      locations = await fetchLocationsByChannels(
        user_id,
        authorizedChannelsData.channelIds,
        memberId
      );
    } 
    else if (has(authorizedChannelsData.departmentIds)) {
      locations = await fetchLocationsByDepartment(
        user_id,
        authorizedChannelsData.departmentIds,
        memberId
      );
    }

    // Deduplicate string locations
    authorizedChannelsData.locations = uniqueStrings(locations);
  }

  /* =========================
     2️⃣ RESOLVE NVRS (ObjectId)
     ========================= */
  if (!has(authorizedChannelsData.nvrIds)) {
    let nvrs = [];

    if (has(authorizedChannelsData.locations)) {
      nvrs = await fetchNVRsByLocation(
        user_id,
        authorizedChannelsData.locations,
        memberId
      );
    } 
    else if (has(authorizedChannelsData.channelIds)) {
      nvrs = await fetchNVRByChannels(
        user_id,
        authorizedChannelsData.channelIds,
        memberId
      );
    } 
    else if (has(authorizedChannelsData.departmentIds)) {
      nvrs = await fetchNVRByDepartment(
        user_id,
        authorizedChannelsData.departmentIds,
        memberId
      );
    }

    authorizedChannelsData.nvrIds = uniqueObjectIds(
      nvrs.map(d => d._id)
    );
  }

  /* =========================
     3️⃣ RESOLVE CHANNELS (ObjectId)
     ========================= */
  if (!has(authorizedChannelsData.channelIds)) {
    let channels = [];

    if (has(authorizedChannelsData.nvrIds)) {
      channels = await fetchChannelsByNVRIds(
        user_id,
        authorizedChannelsData.nvrIds,
        memberId,
        ""
      );
    } 
    else if (has(authorizedChannelsData.locations)) {
      channels = await fetchChannelsByLocation(
        user_id,
        authorizedChannelsData.locations,
        memberId,
        ""
      );
    } 
    else if (has(authorizedChannelsData.departmentIds)) {
      channels = await fetchChannelsByDepartment(
        user_id,
        authorizedChannelsData.departmentIds,
        memberId,
        ""
      );
    }

    authorizedChannelsData.channelIds = uniqueObjectIds(
      channels.map(d => d._id)
    );
  }

  /* =========================
     4️⃣ RESOLVE DEPARTMENTS (ObjectId)
     ========================= */
  if (!has(authorizedChannelsData.departmentIds)) {
    let depts = [];

    if (has(authorizedChannelsData.channelIds)) {
      depts = await fetchDepartmentsByChannels(
        user_id,
        authorizedChannelsData.channelIds,
        memberId
      );
    } 
    else if (has(authorizedChannelsData.nvrIds)) {
      depts = await fetchDepartmentsByNVRs(
        user_id,
        authorizedChannelsData.nvrIds,
        memberId
      );
    } 
    else if (has(authorizedChannelsData.locations)) {
      depts = await fetchDepartmentsByLocation(
        user_id,
        authorizedChannelsData.locations,
        memberId
      );
    }

    authorizedChannelsData.departmentIds = uniqueObjectIds(
      depts.map(d => d._id)
    );
  }

  return authorizedChannelsData;
}










//Helper function for Departments
async function fetchDepartmentsByLocation(userId,selectedLocations,memberId){
    let NVRs = await NVR.find(
    {
        memberId,                    // only for middleware
        userId,                      // actual DB filter
        location: { $in: selectedLocations }
    }
    ).select("_id");

    
    //Fetch all the channels related to NVR
    const channels = await Channel.find(
    { nvrId: { $in: NVRs } },                       // query
    "_id department",                               // projection
    { memberId} // <-- pass memberId to middleware
    );
    

    //Extract unique department IDs
    const departmentIds = new Set();
            channels.forEach(ch => {
            if (Array.isArray(ch.department)) {
                ch.department.forEach(d => departmentIds.add(d.toString()));
            }
    });        
    const idsArray = [...departmentIds];
    
        // 5. Fetch department list
        const Departments = await departmentModel.find(
        { _id: { $in: idsArray } },    // normal query filter
        "_id departmentName",          // projection
        { memberId }                   // pass memberId for authorization
        );

        
    return Departments;
}

//Helper functions for NVRs
async function fetchNVRsByLocation(userId,selectedLocations,memberId){
    let NVRs = await NVR.find(
    {
        memberId,                         // for middleware authorization ONLY
        userId,                           // actual DB filter
        location: { $in: selectedLocations }
    }
    ).select("_id nvrName location model");

    return NVRs
}

//helper functions for Channels
async function fetchChannelsByLocation(userId, selectedLocations, memberId, searchQuery) {
    // Step 1: Fetch NVRs based on selected locations
    let locationNVRs = await NVR.find(
        {
            memberId,   // middleware only
            userId,     // DB filter
            location: { $in: selectedLocations }
        }
    ).select("_id");

    let locationNVRIds = locationNVRs.map(nvr => nvr._id.toString());

    // Build base channel filter
    let channelFilter = {
        nvrId: { $in: locationNVRIds }
    };

    // Add search filter ONLY if searchQuery exists
    if (searchQuery?.trim()) {
        channelFilter.$or = [
            { customName: { $regex: searchQuery, $options: "i" } },
            { name: { $regex: searchQuery, $options: "i" } }
        ];
    }

    // Step 2: Fetch channels
    let channels = await Channel.find(
        channelFilter,                        // complete query
        "_id name nvrId customName",          // projection
        { memberId }                          // middleware option
    );

    return channels;
}


//Helper function for Locations
async function fetchLocationsByNVRs(userId,nvrIds,memberId){
    let distinctLocations = await NVR.distinct(
                            "location",
                            { memberId, userId, _id: { $in: nvrIds } }
                            );

    return distinctLocations;
}

async function fetchDepartmentsByNVRs(userId,NvrIds,memberId){
    let NVRs = await NVR.find(
    {
        memberId,             // for middleware authorization ONLY
        userId,               // actual DB filter
        _id: { $in: NvrIds }
    }
    ).select("_id");

    //Fetch all the channels related to NVR
    const channels = await Channel.find(
    { nvrId: { $in: NVRs } },                       // query
    "_id department",                               // projection
    { memberId }    // <-- pass memberId to middleware
    );


    //Extract unique department IDs
    const departmentIds = new Set();
            channels.forEach(ch => {
            if (Array.isArray(ch.department)) {
                ch.department.forEach(d => departmentIds.add(d.toString()));
            }
    });        
    const idsArray = [...departmentIds];
        // 5. Fetch department list
    const Departments = await departmentModel.find(
    { _id: { $in: idsArray } },   // query
    "_id departmentName",         // projection
    { memberId }                  // pass memberId to middleware
    );

    return Departments;
}

async function fetchChannelsByNVRIds(userId, nvrIds, memberId,searchQuery) {
    const channels = await Channel.find(
                        { 
                        nvrId: { $in: nvrIds },
                        ...(searchQuery?.trim() && {
                        $or: [
                            { customName: { $regex: searchQuery, $options: "i" } },
                            { name: { $regex: searchQuery, $options: "i" } }
                        ]
                        })
                        },                   // query
                        "_id name nvrId customName",                  // projection
                        {  memberId }     // <-- passed ONLY to middleware
                        );
                        return channels;
}

async function fetchLocationsByDepartment(userId,departmentId,memberId){
   let locationChannels = await Channel.find(
        { department: { $in: departmentId } }, // query
        "_id nvrId",                           // projection
        { memberId }  // <-- passed to middleware
        );

    let nvrIdSet = new Set(locationChannels.map(ch=> ch.nvrId.toString()));
    let distinctLocations = await NVR.distinct(
    "location",
    {
        memberId,                  // for middleware authorization ONLY
        userId,                   // real DB field
        _id: { $in: [...nvrIdSet] }
    }
    );

    return distinctLocations;
}

async function fetchNVRByDepartment(user_id,departmentId,memberId){
    const channels = await Channel.find(
                    { department: { $in: departmentId } }, // query
                      "nvrId",                                // projection
                    { memberId }                            // pass memberId to middleware
                    );

    let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
    let NVRs = await NVR.find(
                      {
                          memberId,                       // for middleware authorization ONLY
                          userId: user_id,                // actual DB filter
                          _id: { $in: Array.from(nvrIdSet) }
                      }
                      ).select("_id nvrName location model");

      return NVRs;
}

async function fetchChannelsByDepartment(user_id,departmentIds,memberId,searchQuery){
    const channels = await Channel.find(
                { department: { $in: departmentIds } ,
                ...(searchQuery?.trim() && {
                  $or: [
                    { customName: { $regex: searchQuery, $options: "i" } },
                    { name: { $regex: searchQuery, $options: "i" } }
                      ]
              }) },     // query
              "_id name nvrId customName",                // projection
              {  memberId } // <-- passed to middleware ONLY
              );
    return channels;
}

async function fetchLocationsByChannels(userId,channelIds,memberId){
    let locationChannels = await Channel.find(
        { _id: { $in: channelIds } },        // query
        "_id nvrId",                         // projection
        { memberId }  // <-- pass userId here
        );

    let nvrIdSet = new Set(locationChannels.map(ch=> ch.nvrId.toString()));
    let distinctLocations = await NVR.distinct(
    "location",
    {
        memberId,                   // for middleware authorization ONLY
        userId,                     // actual DB filter
        _id: { $in: [...nvrIdSet] }
    }
    );

    return distinctLocations;
}

async function fetchNVRByChannels(user_id,channelsIds,memberId){
      const channels = await Channel.find(
                      { _id: { $in: channelsIds } }, // query
                      "nvrId",                       // projection
                      { memberId }                   // pass memberId to middleware
                      );

      let nvrIdSet = new Set(channels.map(ch=> ch.nvrId.toString()));
      let NVRs = await NVR.find(
                      {
                        memberId,                       // for middleware authorization ONLY
                        userId: user_id,                // actual DB filter
                        _id: { $in: Array.from(nvrIdSet) }
                      }
                      ).select("_id nvrName location model");

                      return NVRs;
}


async function fetchDepartmentsByChannels(userId,channelIds,memberId){
    //Fetch all the channels 
    const channels = await Channel.find(
    {
        userId,                      // this filters by DB field if needed
        _id: { $in: channelIds }
    },
    "_id department",
    { memberId }                     // <-- THIS goes to middleware
    );


    //Extract unique department IDs
    const departmentIds = new Set();
            channels.forEach(ch => {
            if (Array.isArray(ch.department)) {
                ch.department.forEach(d => departmentIds.add(d.toString()));
            }
    });        
    const idsArray = [...departmentIds];
        // 5. Fetch department list
    const Departments = await departmentModel.find(
    { _id: { $in: idsArray } },   // query
    "_id departmentName",         // projection
    { memberId }                  // pass memberId to middleware
    );


    return Departments;
}

// Helper: Concurrency control function
export const runWithConcurrency = async (tasks, concurrencyLimit = 10) => {
  const results = [];
  const executing = [];

  for (const [index, task] of tasks.entries()) {
    const promise = Promise.resolve().then(() => task()).then(
      result => results[index] = result
    );
    executing.push(promise);

    if (executing.length >= concurrencyLimit) {
      const settled = await Promise.race(
        executing.map((p, idx) => p.then(() => idx, () => idx))
      );
      executing.splice(settled, 1);
    }
  }

  await Promise.all(executing);
  return results;
};

export const deleteAuthorizedUserById = async (userId, userDataPrefetch = null) => {
  const status = {
    userId,
    deletedFromDb: false,
    deletedFromSftp: false,
    deletedFromAi: false,
    errors: []
  };

  try {
    if (!userId) {
      throw new Error("userId is required");
    }

    // 0️⃣ Use prefetched data if available, otherwise fetch from DB
    const userToDelete = userDataPrefetch || await authorizedUsers.findById(userId);

    if (!userToDelete) {
      throw new Error("Authorized user not found");
    }
    console.log(userId,'userId');
    
    // 1️⃣ Delete user from DB
    const deletedUser = await authorizedUsers.findByIdAndDelete(userId);
    console.log(deletedUser,'deletedUser');
    console.log(userToDelete,'userToDelete');
    status.deletedFromDb = !!deletedUser;

    // 2️⃣ Prepare media path
    const mediaPath = decodeURIComponent(
      `/emp-cctv-dev-media/uploads/images/${userToDelete?.firstName}`
    );

    // 3️⃣ Delete from local cache and SFTP in parallel
    const [localResult, sftpResult] = await Promise.allSettled([
      // Delete from local cache
      (async () => {
        if (userToDelete?.verified !== true) return true;
        try {
          const fileName = path.basename(mediaPath);
          const cachedFilePath = path.join(cacheDir, fileName);

          if (fs.existsSync(cachedFilePath)) {
            const stats = fs.lstatSync(cachedFilePath);

            if (stats.isDirectory()) {
              fs.rmSync(cachedFilePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(cachedFilePath);
            }
          }
          return true;
        } catch (err) {
          console.log("Local delete error:", err.message);
          status.errors.push(`Local cache error: ${err.message}`);
          return false;
        }
      })(),
      // Delete from SFTP
      (async () => {
        if (userToDelete?.verified !== true) return true;
        try {
          const sftp = await checkSftpConnection();
          const exists = await sftp.exists(mediaPath);

          if (exists === "d") {
            await sftp.rmdir(mediaPath, true);
          } else if (exists === "-") {
            await sftp.delete(mediaPath);
          }
          return true;
        } catch (err) {
          console.log("SFTP delete error:", err.message);
          status.errors.push(`SFTP error: ${err.message}`);
          return false;
        }
      })()
    ]);

    status.deletedFromSftp = sftpResult.status === 'fulfilled' && sftpResult.value;

    // 4️⃣ Delete from AI service (only if user was verified)
    if (userToDelete?.verified === true) {
      try {
        const { dsAuthUsersAPI } = await resolveAdminEndpoints(userToDelete?.adminId);
        const url = `${dsAuthUsersAPI}/delete/${userId}`;
        await axios.delete(url, {
          headers: { accept: "application/json" },
        });
        status.deletedFromAi = true;
      } catch (err) {
        if (err.response) {
          console.log(`AI delete failed (${err.response.status}): ${JSON.stringify(err.response.data)}`);
          status.errors.push(`AI Service error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
        } else {
          console.log("AI Service Error:", err.message);
          status.errors.push(`AI Service error: ${err.message}`);
        }
      }
    } else {
      status.deletedFromAi = true; // No AI deletion needed if not verified
    }

    return { deletedUser, status };
  } catch (error) {
    status.errors.push(`Critical error: ${error.message}`);
    return { deletedUser: null, status };
  }
};

export default new UsersService();
