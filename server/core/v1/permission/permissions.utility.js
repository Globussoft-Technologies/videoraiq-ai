import Response from '../../../utils/response.js';
import logger from '../../../utils/logger.js';
import { PermissionMessageNew ,commonMessage} from '../../../language/language.translator.js';
import permissionModel from './permissions.model.js';
import { ObjectId } from 'mongodb';
import PermissionValidation from './permissions.validation.js'
import userModel from '../authorizedUsers/authorizedUsers.model.js';
import roleModel from '../roles/roles.model.js';
import adminModel from '../admin/admin.model.js';
import config from "config";
import usersModel from '../users/users.model.js';





class PermissionService {
    async create(req, res) {
        try {
            const result = req.verified;
            let { _id: userId, language, orgId, planData, adminId, firstName: Name, profilePic: userProfilePic, lastName, creatorId,userName} = result.userData;
                const data = req.body;
                const permissionConfig = data.permissionConfig;
                const permissionDetails = data?.permissionName;
                let regex = new RegExp(permissionDetails.toLowerCase(), 'i');
                let newPermission = [];
                let existPermission = [];
                const { error } = PermissionValidation.createPermission(data);
                if (error) {
                    return res.send(Response.FailResp(PermissionMessageNew['VALIDATION_FAIL'][language ?? 'en'], error.message));
                }
                // let totalData = await permissionModel.aggregate([{ $match: { adminId:new ObjectId(userId) } }, { $match: { is_default: { $ne: true } } }])
                // if (totalData.length == planData.customizePermission) {
                //     return res.status(429).send(Response.FailResp('Permissions adding limit is reached in your plan, please upgrade your plan.'));
                // }
                let response = await permissionModel.find({ permissionName: regex, adminId:new ObjectId(adminId||userId) });
                if (response.length === 0) {
                    newPermission.push(permissionDetails);
                } else {
                    response.map(oldPermission => {
                        existPermission.push(oldPermission.permissionName);
                    });
                    let regexValue = new RegExp(existPermission.join('|'), 'i');
                    if (!regexValue.test(permissionDetails)) {
                        newPermission.push(permissionDetails);
                    }
                }
                if (existPermission.length) {
                    res.send(Response.FailResp(`permissionName ${existPermission} already exist for admin ${userName}.Please provide different name.`));
                } else {
                    let responseData;
                    let permissionId = await new Promise((resolve, reject) => {
                        if (newPermission.length > 0) {
                            try {
                                newPermission.map(async permission_new => {
                                    let permissionName = {
                                        adminId: adminId||userId,
                                        permissionName: permission_new.toLowerCase(),
                                    };
                                        permissionName.permissionConfig = permissionConfig,
                                        permissionName.is_default = false,
                                        permissionName.createdBy = { userId: userId },
                                        permissionName.createdAt = new Date();
                                    responseData = await permissionModel.create(permissionName);
                                    resolve(responseData?._id);
                                });
                            } catch (error) {
                                logger.error(`Error while inserting new permissions ${error.message}`);
                                reject(error);
                            }
                        }
                    });
                    if (newPermission.length > 0) {
                        res.send(Response.SuccessResp(`${newPermission} permissions created.`));
                    }
                }
            } catch (err) {
                logger.error(`error ${err}`);
                res.send(Response.FailResp(PermissionMessageNew['PERMISSION_CREATION_FAILED']['en'], err.message));
            }

    }

    async fetchPermissions(req, res) {
        const result = req.verified;
        let { _id: userId, language, orgId, planData, adminId, firstName: Name, profilePic: userProfilePic, lastName, creatorId} = result.userData;
            try {
                const sortBy = {};
                let permissionId = req.query.permissionId;
                const custom = req.query.custom;
                sortBy[req.query.orderby || 'createdAt'] = req.query.sort === 'asc' ? 1 : -1;
                let totalCount = 0;
                let data;
                if (permissionId) {
                    data = await permissionModel.find({ $and: [{ _id: new ObjectId(permissionId) },{adminId:new ObjectId(adminId||userId)}] }).sort(sortBy).skip(req.query.skip).limit(req.query.limit);
                    totalCount = data.length;
                }
                else {
                    data = await permissionModel.find({ adminId: new ObjectId(adminId||userId)}).sort(sortBy).skip(req.query.skip).limit(req.query.limit)
                    totalCount = data.length;
                    if(!data){
                        res.send(Response.FailResp(PermissionMessageNew['ADMIN_VIEW']['en'],'error'));
                    }
                }
                if (!adminId && data.length === 0) {
                    res.send(Response.FailResp(PermissionMessageNew['ADMIN_VIEW']['en'],'error'));
                } else if(data.length === 0){
                    res.send(Response.FailResp(PermissionMessageNew['NO_DATA_FOUND']['en'],'error'));

                } else {

                    let response = {
                        TotalCount: totalCount,
                        Permissions: data,
                    };
                    res.send(Response.SuccessResp(PermissionMessageNew['PERMISSION_FETCH_SUCCESS'][language ?? 'en'], response));
                }
            } catch (err) {
                logger.error(`error ${err}`);
                res.send(Response.FailResp(PermissionMessageNew['FETCH_ERROR'][language ?? 'en'], err.message));
            }

    }    

    async updatePermissions(req, res) {
        const result = req.verified;
        let { _id: userId, language ,adminId} = result.userData;
        
        try {
            let permissionId = req?.query?.permissionId;
            const data = req.body;
            const permissionConfig = data?.permissionConfig;
            
            // Validate incoming data
            const { value, error } = PermissionValidation.updatePermission(data);
            if (error) {
                return res.send(
                    Response.FailResp(
                        PermissionMessageNew['VALIDATION_FAIL']['en'],
                        error.message
                    )
                );
            }
    
            // Fetch the existing permission document
            let defaultData = await permissionModel.findById({_id:permissionId});
            if (!defaultData) {
                return res.send(
                    Response.FailResp(
                        PermissionMessageNew['PERMISSION_NOT_FOUND']['en'],
                        commonMessage['VALIDATION_FAILED']['en']
                    )
                );
            }
            
            const updateFields = {};

            // check for duplicatePermissionName
            if(value?.permissionName){
                const permissionName= value?.permissionName
                const duplicateName = await permissionModel.findOne({permissionName: permissionName,_id: { $ne: permissionId }});
                if(duplicateName) return res.send(Response.FailResp(`${permissionName} permission Name already exists, unable to update`));
               
                updateFields.permissionName = permissionName;
            }

            if(permissionConfig){
                const updatedPermissionConfig = { ...defaultData.permissionConfig };
                // Update only existing modules
                for (const moduleKey in permissionConfig) {
                    if (permissionConfig.hasOwnProperty(moduleKey)) {
                        // Check if the module exists in defaultData.permissionConfig
                        if (defaultData.permissionConfig.hasOwnProperty(moduleKey)) {
                            if (moduleKey === 'logs') {
                                updatedPermissionConfig[moduleKey] = { ...defaultData.permissionConfig[moduleKey] };
                                for (const subKey in permissionConfig[moduleKey]) {
                                    if (defaultData.permissionConfig[moduleKey].hasOwnProperty(subKey)) {
                                        updatedPermissionConfig[moduleKey][subKey] = {
                                            ...defaultData.permissionConfig[moduleKey][subKey],
                                            ...permissionConfig[moduleKey][subKey]
                                        };
                                    } else {
                                        throw new Error(`Sub-module '${subKey}' does not exist in 'logs' configuration.`);
                                    }
                                }
                            } else {
                                updatedPermissionConfig[moduleKey] = {
                                    ...defaultData.permissionConfig[moduleKey], // Preserve existing fields
                                    ...permissionConfig[moduleKey],           // Update only specified fields
                                };
                            }
                        } else {
                            throw new Error(`Module '${moduleKey}' does not exist in the current permission configuration.`);
                        }
                    }
                }
                updateFields.permissionConfig = updatedPermissionConfig;
            }

            if (Object.keys(updateFields).length === 0) {
                return res.send(
                    Response.FailResp(
                        PermissionMessageNew['VALIDATION_FAIL'][language ?? 'en'],
                        'No valid fields to update'
                    )
                );
            }
            const isDefaultPermission = defaultData.is_default;
            if(isDefaultPermission){
                return res.send(Response.FailResp(PermissionMessageNew['UPDATE_DEFAULT_PERMISSIONS'][language ?? 'en'],commonMessage['VALIDATION_FAILED']['en']));
            }
            const response = await permissionModel.findOneAndUpdate(
                { _id: permissionId },
                { $set: updateFields },
                { returnDocument: 'after' }
            );


            if (response?.permissionConfig) {

            // ✅ Uniform check (all true / all false / mixed -> null)
            const checkUniform = (key, ignoreChannels = false) => {
            const tempModules = [];
            Object.entries(response.permissionConfig).forEach(([modName, modVal]) => {
                if (ignoreChannels && modName === "channels") return;
                
                if (modName === "logs" && typeof modVal === 'object') {
                    tempModules.push(...Object.values(modVal));
                } else {
                    tempModules.push(modVal);
                }
            });

            if (!tempModules.length) return null;

            const allTrue = tempModules.every(m => m[key] === true);
            const allFalse = tempModules.every(m => m[key] === false);

            return allTrue ? true : allFalse ? false : null;
            };


            const updateObj = {};

            // ✅ Normal uniform logic
            const viewStatus = checkUniform("view");
            const editStatus = checkUniform("edit");

            // ✅ IGNORE channels only for create & delete
            const createStatus = checkUniform("create", true);
            
            const deleteStatus = checkUniform("delete", true);

            if (viewStatus !== null) updateObj.view = viewStatus;
            
            if (editStatus !== null) updateObj.edit = editStatus;
            
            if (createStatus !== null) updateObj.create = createStatus;
            
            if (deleteStatus !== null) updateObj.delete = deleteStatus;
            

            if (Object.keys(updateObj).length > 0) {
                await roleModel.updateMany(
                { adminId: adminId, permissionId: response._id },
                { $set: updateObj }
                );
            }
            }




            return res.send(Response.SuccessResp(PermissionMessageNew['PERMISSIONS_UPDATED'][language ?? 'en'],response));

        } catch (err) {
            logger.error(`Error: ${err}`);
           return res.send(Response.FailResp('Error while update permission', err.message));
        }
    }
    

    async deletePermissions(req, res) {
        const result = req.verified;
        let { _id: userId, language, orgId, planData, adminId, firstName: Name, profilePic: userProfilePic, lastName, creatorId} = result.userData;
            try {
                const permissionId = req?.query?.permissionId;

                if (permissionId) {
                    let permissionData = await permissionModel.findById({ _id: permissionId });
                    if (!permissionData) {
                        return res.send(Response.FailResp(PermissionMessageNew['PERMISSION_NOT_FOUND'][language ?? 'en'],commonMessage['VALIDATION_FAILED']['en']));
                    }
                    // if (permissionData.is_default === true) {
                    //     return res.send(Response.FailResp(PermissionMessageNew['DELETE_DEFAULT_PERMISSIONS'][language ?? 'en'],commonMessage['VALIDATION_FAILED']['en']));
                    // }
                        let data;
                        data = await permissionModel.deleteOne({ _id:permissionId });
                        res.send(Response.SuccessResp(PermissionMessageNew['DELETE_PERMISSIONS'][language ?? 'en'], data));
                } else {
                    const allPermissionData = await permissionModel
                        .aggregate([{ $match: { adminId:adminId } }]);
                    const allData = allPermissionData.map(item => {
                        let data = item.permissionName;
                        return data;
                    });

                        const data = await permissionModel
                            .aggregate([{ $match: { $and: [{ adminId: adminId }, { is_default: { $ne: true } }] } }]);
                        data.forEach(async function (ele) {
                            const key = { is_default: { $ne: true } ,'createdBy.userId':userId};
                             await collectionName.deleteMany(key);
                        });
                        data.length
                            ? res.send(Response.SuccessResp(PermissionMessageNew['DELETE_PERMISSIONS'][language ?? 'en'], { DeletedCount: data.length }))
                            : res.send(Response.FailResp(PermissionMessageNew['DELETE_DEFAULT_PERMISSIONS'][language ?? 'en'],null));

                }
            } catch (err) {
                logger.error(`error ${err}`);
                res.send(Response.FailResp('Invalid permission Id', err.message));
            }

    }

    async fetchRolesPermission(req, res) {
        try {
            const result = req.verified;
            let { _id: userId, language ,adminId} = result.userData;
            const skip = +req?.query?.skip || 0;
            const limit = +req.query.limit || 10;
            let searchQuery = req.query.searchQuery || "";
            const sortBy = {};
            sortBy[req?.query?.orderBy || "createdAt"] = req?.query?.sort?.toString() === "asc" ? 1 : -1;
    
            let isAdminExist = await adminModel.findOne({ _id: new ObjectId(adminId) });
            // if (!isAdminExist) {
            //     return res.send(Response.FailResp(PermissionMessageNew["ADMIN_NOT_EXIST"]["en"], null));
            // }
            let roleWithPermission = false;
            let restrictFields = true
            if(!isAdminExist){
                roleWithPermission = req.verified?.permissionConfig;
                const permissionConfig = roleWithPermission[0]?.permissionConfig;
                restrictFields = permissionConfig?.['permission']?.view
            }
            const rolesWithPermissions = await roleModel.aggregate([
                {
                    $match: {
                        adminId: new ObjectId(adminId),
                        ...(searchQuery && {
                            roleName: { $regex: searchQuery, $options: "i" } // Case-insensitive regex search
                        })
                    }
                },

                {
                    $lookup: {
                        from: "permissionschemas",
                        localField: "permissionId",
                        foreignField: "_id",
                        as: "permissionDetails"
                    }
                },
                {
                    $unwind: {
                        path: "$permissionDetails",
                        preserveNullAndEmptyArrays: true
                    }
                },
                // ...(restrictFields ? []: [{ $unset: ["create","edit","view","delete"] }]),
                {
                    $project: {
                        _id: 1,
                        roleName: 1,
                        view: 1,
                        create: 1,
                        edit: 1,
                        delete: 1,
                        is_default: 1,
                        createdBy: 1,
                        createdAt:1,
                        updatedAt:1,
                        "permissionDetails._id": 1,
                        "permissionDetails.permissionName": 1,
                        "permissionDetails.permissionConfig": 1
                    }
                },
                { $sort: sortBy },
                { $skip: skip },
                { $limit: limit }
            ]);
            const totalRoles = await roleModel.countDocuments({
                adminId: adminId,
                ...(searchQuery && { roleName: { $regex: searchQuery, $options: "i" } })
            });
    
            let finalResult = {
                totalLength: totalRoles,
                rolesWithPermissions
            };
    
            res.send(
                Response.SuccessResp(PermissionMessageNew["ROLES_PERMISSION_FETCHED"][language ?? "en"], finalResult)
            );
        } catch (error) {
            logger.error(`error ${error}`);
            res.send(Response.FailResp("Something went wrong!", error.message));
        }
    }

    async bulkPermissionUpdate(req,res,next){
        const result = req.verified;
        let { _id: userId,adminId, language, orgId, planData, firstName: Name, profilePic: userProfilePic, lastName, creatorId} = result.userData;
        try{
            let data = req.body;
            let admin = await adminModel.findOne({_id:adminId});
            if(!admin) return res.send(Response.FailResp(PermissionMessageNew['ADMIN_NOT_EXIST']['en'],'error'));

            let isAdminUsersExist = await userModel.find({adminId:adminId});
            if(!isAdminUsersExist?.length){
                res.send(Response.FailResp(PermissionMessageNew['NO_ADMIN_USERS_FOUND']['en'],'error'));
            }
            const { value, error } = PermissionValidation.updateBulkPermission(data);
            if(error) return res.send(Response.FailResp(PermissionMessageNew['VALIDATION_FAIL']['en'], error.message));

            let permissionConfig = value.permissionConfig.reduce((acc, item) => {
                const { moduleName, ...rest } = item; // Destructure to remove 'moduleName'
                acc[moduleName.toLowerCase()] = rest; // Assign the rest of the fields
                return acc;
            }, {});
            
            let updatedPermissions = await permissionModel.updateMany(
                { adminId: adminId }, 
                {
                    $set: {
                        ...Object.entries(permissionConfig).reduce((acc, [key, value]) => {
                            acc[`permissionConfig.${key}`] = value;
                            return acc;
                        }, {}),
                        updatedAt: new Date(), 
                    }
                }
            );
            
            
        res.send(Response.SuccessResp(PermissionMessageNew['BULK_UPDATE_SUCCESS']['en'],updatedPermissions));

        } catch (error) {
            logger.error(`error ${error}`);
            res.send(Response.FailResp(PermissionMessageNew["BULK_UPDATE_FAILED"]['en'], error.message));
        }
    }

    async bulkPermissionDelete(req, res, next) {
        try {
            const result = req.verified;
            let { _id: userId,adminId, language, orgId, planData, firstName: Name, profilePic: userProfilePic, lastName, creatorId } = result.userData;
            let data = req.body; 
            let admin = await adminModel.findOne({ _id:adminId });
    
            if (!admin) return res.send(Response.FailResp(PermissionMessageNew['ADMIN_NOT_EXIST']['en'], 'error'));
    
           
            if (!data?.permissionConfig?.length) {
                return res.send(Response.FailResp(PermissionMessageNew["NO_PERMISSION_CONFIG_PROVIDED"]['en'], "error"));
            }
    
            let moduleNamesToDelete = data.permissionConfig.map(item => item.moduleName);

            let adminPermission = await permissionModel.findOne({ adminId: adminId});

            // Case-insensitive module lookup: map requested module names to actual keys in permissionConfig
            const configKeys = Object.keys(adminPermission.permissionConfig || {});
            const moduleMap = {};
            const missingModules = [];

            moduleNamesToDelete.forEach(requestedModule => {
                const actualKey = configKeys.find(key => key.toLowerCase() === requestedModule.toLowerCase());
                if (actualKey) {
                    moduleMap[requestedModule] = actualKey;
                } else {
                    missingModules.push(requestedModule);
                }
            });

            if (missingModules.length > 0) {
                // Return error if any moduleName is not found in the database
                return res.send(Response.FailResp(`Modules not found: ${missingModules.join(', ')}`, 'error'));
            }

            // Construct an object where each key represents a module to be removed from permissionConfig
            let unsetFields = moduleNamesToDelete.reduce((acc, requestedModule) => {
                const actualKey = moduleMap[requestedModule];
                acc[`permissionConfig.${actualKey}`] = "";
                return acc;
            }, {});

            // Perform the bulk delete operation
            let updatedPermissions = await permissionModel.updateMany(
                { 
                    adminId: adminId, 
                },
                {
                    $unset: unsetFields, // Unset the specified modules from permissionConfig
                    $set: {
                        updatedAt: new Date(), // Update the timestamp
                    },
                }
            );
    
            if (updatedPermissions.modifiedCount > 0) {
                res.send(Response.SuccessResp(PermissionMessageNew["PERMISSION_CONFIG_DELETE_SUCCESS"]["en"],updatedPermissions));
            } else {
                res.send(Response.FailResp(PermissionMessageNew["PERMISSION_CONFIG_DELETE_UNSUCCESSFUL"]["en"], "error"));
            }
            
        } catch (error) {
            logger.error(`error ${error}`);
            res.send(Response.FailResp(PermissionMessageNew["PERMISSION_CONFIG_DELETE_ERROR"]['en'], error.message));
        }
    }

    async userPermissions(req,res,next){
        const result = req.verified;
        try{
            let {memberId,adminId} = result.userData;

            if(memberId){
            let isUserExist = await usersModel.findOne({_id:memberId});
            if(!isUserExist) return res.send(Response.FailResp(PermissionMessageNew["USER_NOT_FOUND"]['en']));
            const roleWithPermission = await roleModel.aggregate([
                { $match: { _id: new ObjectId(isUserExist.roleIds) } },
                {
                  $lookup: {
                      from: "permissionschemas",
                      localField: "permissionId",
                      foreignField: "_id",
                      as: "permissionDetails",
                      pipeline: [{ $project: { permissionConfig: 1, _id: 0 } }],
                  },
              },
              { $unwind: "$permissionDetails" },
              { $project: { roleName:1,permissionConfig: "$permissionDetails.permissionConfig" } },
              ]);
              if(roleWithPermission){
                res.send(Response.SuccessResp(PermissionMessageNew["PERMISSION_FETCH_SUCCESS"]["en"],roleWithPermission));
              }
            }else{
                let isAdminExist = await adminModel.findOne({_id:adminId});
                if(!isAdminExist) return res.send(Response.FailResp(PermissionMessageNew["ADMIN_NOT_EXIST"]["en"]));
                const roleWithPermission = await roleModel.aggregate([
                    { $match: { roleName:"admin",adminId: new ObjectId(adminId), is_default:true } },
                    {
                      $lookup: {
                          from: "permissionschemas",
                          localField: "permissionId",
                          foreignField: "_id",
                          as: "permissionDetails",
                          pipeline: [{ $project: { permissionConfig: 1, _id: 0 } }],
                      },
                  },
                  { $unwind: "$permissionDetails" },
                  { $project: { roleName:1,permissionConfig: "$permissionDetails.permissionConfig" } },
                  ]);
                  if(roleWithPermission){
                    res.send(Response.SuccessResp(PermissionMessageNew["PERMISSION_FETCH_SUCCESS"]["en"],roleWithPermission));
                  }
            }

        }catch(error){
            logger.error(`error ${error}`);
            res.send(Response.FailResp(PermissionMessageNew["FETCH_ERROR"]['en'], error.message));
        }
    }
    
    async updateAdminPermissions(req, res, next) {
        const result = req.verified;
        let { _id: userId, language, adminId } = result.userData;

        try {
            let data = req.body;
            let targetAdminId = data.adminId || adminId;
            let admin = await adminModel.findOne({ _id: targetAdminId });
            
            if (!admin) return res.send(Response.FailResp(PermissionMessageNew['ADMIN_NOT_EXIST']['en'], 'error'));
            if (!data.permissionConfig) return res.send(Response.FailResp("permissionConfig is required", "error"));

            let permissionsList = await permissionModel.find({ adminId: targetAdminId });
            let permissionConfigUpdates = data.permissionConfig;
            let count = 0;

            for (let perm of permissionsList) {
                let updatedPermissionConfig = { ...perm.permissionConfig };

                for (const moduleKey in permissionConfigUpdates) {
                    if (updatedPermissionConfig.hasOwnProperty(moduleKey)) {
                        if (moduleKey === 'logs' && typeof permissionConfigUpdates.logs === 'object') {
                            updatedPermissionConfig.logs = { ...updatedPermissionConfig.logs };
                            for (const subKey in permissionConfigUpdates.logs) {
                                if (updatedPermissionConfig.logs.hasOwnProperty(subKey)) {
                                    updatedPermissionConfig.logs[subKey] = {
                                        ...updatedPermissionConfig.logs[subKey],
                                        ...permissionConfigUpdates.logs[subKey]
                                    };
                                }
                            }
                        } else {
                            updatedPermissionConfig[moduleKey] = {
                                ...updatedPermissionConfig[moduleKey],
                                ...permissionConfigUpdates[moduleKey]
                            };
                        }
                    }
                }

                perm.permissionConfig = updatedPermissionConfig;
                perm.updatedAt = new Date();
                const response = await perm.save();
                count++;

                // Uniform logic for roles
                if (response?.permissionConfig) {
                    const checkUniform = (key, ignoreChannels = false) => {
                        const tempModules = [];
                        Object.entries(response.permissionConfig).forEach(([modName, modVal]) => {
                            if (ignoreChannels && modName === "channels") return;
                            
                            if (modName === "logs" && typeof modVal === 'object') {
                                tempModules.push(...Object.values(modVal));
                            } else {
                                tempModules.push(modVal);
                            }
                        });

                        if (!tempModules.length) return null;

                        const allTrue = tempModules.every(m => m[key] === true);
                        const allFalse = tempModules.every(m => m[key] === false);

                        return allTrue ? true : allFalse ? false : null;
                    };

                    const updateObj = {};
                    const viewStatus = checkUniform("view");
                    const editStatus = checkUniform("edit");
                    const createStatus = checkUniform("create", true);
                    const deleteStatus = checkUniform("delete", true);

                    if (viewStatus !== null) updateObj.view = viewStatus;
                    if (editStatus !== null) updateObj.edit = editStatus;
                    if (createStatus !== null) updateObj.create = createStatus;
                    if (deleteStatus !== null) updateObj.delete = deleteStatus;

                    if (Object.keys(updateObj).length > 0) {
                        await roleModel.updateMany(
                            { adminId: targetAdminId, permissionId: response._id },
                            { $set: updateObj }
                        );
                    }
                }
            }

            return res.send(Response.SuccessResp(`Admin permissions updated successfully for ${count} roles.`));
        } catch (error) {
            logger.error(`Error: ${error}`);
            return res.send(Response.FailResp('Error while updating admin permissions', error.message));
        }
    }
}
export default new PermissionService();
