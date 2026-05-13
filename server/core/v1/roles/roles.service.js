import Response from "../../../utils/response.js";
import rolesModel from "./roles.model.js";
import RoleValidation from './roles.validate.js';
import {RolesMessageNew,PermissionMiddlewareMessage} from '../../../language/language.translator.js';
import { completeConfig, adminConfig, readConfig, writeConfig } from './../permission/permissions.config.js';
import logger from "../../../utils/logger.js";
import permissionModel from "../permission/permissions.model.js";
import { ObjectId } from "mongoose";
import userModel from "../authorizedUsers/authorizedUsers.model.js";
import adminModel from "../admin/admin.model.js";
import userSchema from "../../v1/users/users.model.js"

class RolesServices{

    async createRoles(req, resp) {
        try {
            const data = req.body;
            const result = req.verified;
            let { orgId ,_id,adminId} = result?.userData;

            const rolesDetails = (data?.roles).map(role => role.toLowerCase());
            const { value, error } = RoleValidation.createRole({ rolesDetails });
            if (error) {
                return resp.send(Response.FailResp(RolesMessageNew['VALIDATION_FAIL']['en'], error.message));
            }
            let regex = rolesDetails.map(function (e) {
                return e.toLowerCase();
            });

            let newRole = [];
            let existRole = [];

            let response = await rolesModel
            .find({ roleName: { $in: regex }, adminId: adminId });
            if (response.length === 0) {
                rolesDetails.map(roleList => newRole.push(roleList));
            } else {
                response.map(oldRole => {
                    existRole.push(oldRole.roleName);
                });
            }
            //Removing Existing roles from rolesDetails
            var regexValue = new RegExp(existRole.join('|'), 'i');
            let newRes = rolesDetails.filter(d => !regexValue.test(d));
            newRes.map(roleList => newRole.push(roleList));

            let permissionData =    {
                adminId,
                permissionName: 'completeDefaultConfig',
                is_default: false,
                "createdBy.userId":_id??adminId,
                permissionConfig: completeConfig,
            }
            //Updating new Roles and their permissions
            if (newRole.length > 0) {
                try {
                    newRole.map(async role_new => {
                        let roles = {
                            adminId: adminId,
                            roleName: role_new.toLowerCase(),
                            is_default: value.is_default,
                            orgId
                        };
                        roles.createdBy = { userId: _id };
                        roles.createdAt = new Date();
                        roles.updatedAt = new Date();
                        let roleInsert = await rolesModel.create(roles);
                        let createdPermission = await permissionModel.create(permissionData);

                        let updatedRole = await rolesModel.findOneAndUpdate(
                          { _id:roleInsert._id}, 
                          { $set: { permissionId: createdPermission._id } }, 
                          { new: true }
                        );
                    });
                    if (existRole.length) {
                        return newRole.length
                            ? resp.send(Response.SuccessResp(`${newRole} ${RolesMessageNew['ROLES_ADD_SUCCESS']['en']} ${existRole} ${RolesMessageNew['ROLES_EXIST']['en']}`))
                            : resp.send(Response.FailResp(`${existRole} ${RolesMessageNew['ROLES_EXIST']['en']} `));
                    } else {
                        return resp.send(Response.SuccessResp(`${newRole} ${RolesMessageNew['ROLES_ADD_SUCCESS']['en']}`));
                    }
                } catch (error) {
                    logger.error(`Error while inserting new Roles ${error.message}`);
                }
            }
            return resp.send(Response.FailResp(`${existRole} ${RolesMessageNew['ROLES_EXIST']['en']} `));

        } catch (err) {
            console.log(err);
           return resp.send(Response.userFailResp('Something went wrong', err))
        }
    }

    async get(req, res) {
        const result = req.verified;
        let {adminId} = result.userData;
            try {
                let isAdminExist = await adminModel.findOne({ _id: adminId });
                if (!isAdminExist) {
                    return res.send(Response.FailResp(RolesMessageNew["ADMIN_NOT_EXIST"]["en"], null));
                }
                const role = req.query.roleName;
                const custom = req.query.custom;
                let userObj = {
                    _id: 1,
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    role: 1,
                    profilePic: 1,
                    isAdmin: 1
                };
                const { value, error } = RoleValidation.fetchRole({ orderby: req.query.orderby || 'createdAt', skipValue: req.query.skip, limitValue: req.query.limit });
                if (error) {
                    return res.send(Response.FailResp(RolesMessageNew['VALIDATION_FAIL'], error.message));
                }
                const sortBy = {};
                sortBy[req.query.orderBy || 'createdAt'] = req.query.sort === 'asc' ? 1 : -1;
                
                if (role) {
                    // const rolesDetails = await roleModel.findOne({ roleName: role });
                    const rolesDetails = await rolesModel.find({ roleName: { $regex: role, $options: 'i' } }).select('-createdBy');
                    const assignedRole = await userModel.aggregate([{ $match: { $and: [{ role: role }] } }, {
                        $project: userObj
                    },
                    ]);
                    let data = {
                        RoleAssignedUserCount: assignedRole?.length,
                        roleData: rolesDetails,
                        AssignedUserRole: assignedRole,
                    };
                    // if (rolesDetails) {
                    //     const rolesActivityDetails = activityOfUser(`${firstName} viewed ${role} role.`, 'Roles', firstName, 'Viewed', orgId, _id, profilePic);
                    //     rolesActivityDetails['roleId'] = rolesDetails._id.toString();
                    //     event.emit('activity', rolesActivityDetails);
                    // }
                    return rolesDetails
                        ? res.send(Response.SuccessResp(RolesMessageNew['ROLES_FETCH_SUCCESS']['en'], data))
                        : res.send(Response.FailResp(RolesMessageNew['ROLES_FETCH_FAIL']['en']));
                }
                let rolesData, roleCount;
                roleCount = await rolesModel.countDocuments({ adminId:adminId}) 
                if (custom) {
                    rolesData = await rolesModel
                        .find({ $and: [{ adminId: adminId}, { is_default: custom }] }).select('-createdBy')
                        .sort(sortBy)
                        .skip(value.skipValue)
                        .limit(value.limitValue)
                }
                else {
                    rolesData = await rolesModel
                        .find({ adminId: adminId}).select('-createdBy')
                        .sort(sortBy)
                        .skip(value.skipValue)
                        .limit(value.limitValue)
                }
                let data = await Promise.all(
                    rolesData.map(async item => {
                        let temp = item.toJSON()
                        let assignedRole = await userModel.aggregate([{ $match:  {roleId: temp?._id}},
                        {
                            $project: userObj
                        },
                        ])
                        temp.AssignedUserRole = assignedRole;
                        return temp;
                    }))
                let response = {
                    rolesCount: roleCount,
                    roleData: data,
                };
                // if (rolesData.length > 0) {
                //     let rolesActivityDetails = activityOfUser(`${firstName + ' ' + lastName} viewed all roles.`, 'Roles', firstName, 'Viewed', orgId, _id, profilePic);
                //     event.emit('activity', rolesActivityDetails);
                // }
                response
                    ? res.send(Response.SuccessResp(RolesMessageNew['ROLES_FETCH_SUCCESS']['en'], response))
                    : res.send(Response.FailResp(RolesMessageNew['ROLES_FETCH_FAIL']['en']));

            } catch (err) {
                console.log(err);
                logger.error(`Error while fetching Roles ${err.message}`);
                return res.send(Response.FailResp(RolesMessageNew['ROLES_FETCH_FAILED']['en'], err.message));
            }

    }

    async update(req, res) {
        const result = req.verified;
        const { language, orgId, firstName, _id, profilePic, lastName, adminId, creatorId, permission } = result.userData;
        const userData = result?.userData?.userData
        try {
            let isAdminExist = await adminModel.findOne({ _id: adminId });
            if (!isAdminExist) {
                return res.send(Response.FailResp(RolesMessageNew["ADMIN_NOT_EXIST"]["en"], null));
            }


            let roleWithPermission;
            let permissionEditAccess = true;
            let roleEditAccess = true;
            if(adminId===undefined){
                roleWithPermission = req.verified?.permissionConfig;
                const permissionConfig = roleWithPermission[0]?.permissionConfig;
                permissionEditAccess = permissionConfig?.['permission']?.edit;
                roleEditAccess = permissionConfig?.['roles'].edit;
            }


            const roleId = req?.query?.roleId;
            const role = req?.body;
            let {roleCreate,roleEdit,roleView,roleDelete} = req.body;
            if (!roleId) {
                return res.send(Response.FailResp(RolesMessageNew['VALIDATION_FAIL'][language ?? 'en'], 'Missing roleId'));
            }
            // check if the userData is user if it is user then don't allow to update their own role & permission
            // if(userData?.adminId){
            //     if(userData.role === roleId){
            //         return res.send(Response.FailResp("You are not allowed to modify your own roles or permissions."))
            //     }
            // }
            const roleValue = role.roleName?.toLowerCase();
            const { value,error } = RoleValidation.updateRole(role);
            if (error) {
                return res.send(Response.FailResp(RolesMessageNew['VALIDATION_FAIL'][language ?? 'en'], error.message));
            }

            const excludedRoleId = new ObjectId(roleId);
            const isRoleExist = await rolesModel.aggregate([
                { $match: { adminId: new ObjectId(adminId), _id: { $ne: excludedRoleId } } }
            ]);
            const userRoles = isRoleExist.map(item => item.roleName.toLowerCase());
            const isRoleDuplicate = userRoles.includes(roleValue);
            const existingRole = await rolesModel.findOne({ _id: roleId });
            if (!existingRole) {
                return res.send(Response.FailResp(RolesMessageNew['ROLES_NOT_FOUND'][language ?? 'en']));
            }
    
            // if (existingRole.is_default) {
            //     return res.send(Response.FailResp(RolesMessageNew['ROLES_DEFAULT_FAILED'][language ?? 'en']));
            // }

            if (isRoleDuplicate) {
                return res.send(Response.FailResp(RolesMessageNew['ROLES_UPDATE_FAIL'][language ?? 'en']));
            }
    
            const updateSet = {};
            const updateAddToSet = {};
           // Prepare update data
           if(role.roleName&&existingRole.is_default===true){
                return res.send(Response.FailResp(RolesMessageNew['ROLES_NAME_UPDATE_FAIL'][language ?? 'en']));
           }
           //Checking Role Edit Access
            if(roleEditAccess){
                if (role.roleName&&existingRole.is_default===false) {
                    updateSet.roleName = roleValue;
                    updateSet.updatedAt = new Date();
                }
            }
            if(!roleEditAccess){
                return res.status(400).send(Response.accessDeniedResp(`${PermissionMiddlewareMessage['EDIT_ACCESS_DENIED']['en']} roles module ⚠️.`));
            }

            //Checking Permission Edit Access
            if(permissionEditAccess){
               
                if (typeof roleCreate !== 'undefined') {
                    updateSet.create = roleCreate;
                }
                if (typeof roleEdit !== 'undefined') {
                    updateSet.edit = roleEdit;
                }
                if (typeof roleDelete !== 'undefined') {
                    updateSet.delete = roleDelete;
                }
                if (typeof roleView !== 'undefined') {
                    updateSet.view = roleView;
                }
            }
            if(!permissionEditAccess){
                return res.status(400).send(Response.accessDeniedResp(`${PermissionMiddlewareMessage['EDIT_ACCESS_DENIED']['en']} roles module ⚠️.`));
            }

            // Ensure updatedBy exists and then set userId
            updateSet.updatedBy = updateSet.updatedBy || {}; // Initialize updatedBy if undefined
            updateSet.updatedBy.userId = _id;



            // Combine $set and $addToSet into a single update query
            const updateQuery = {
                ...(Object.keys(updateSet).length > 0 && { $set: updateSet }),
                ...(Object.keys(updateAddToSet).length > 0 && { $addToSet: updateAddToSet }),
            };

           
            // Update role and ensure the user has permission
            const data = await rolesModel.findOneAndUpdate(
                { _id: roleId },
                updateQuery,
                { new: true } // Return the updated document
            );



            if (existingRole.permissionId&&permissionEditAccess) {
                // Step 4: Fetch the associated permission
                const permission = await permissionModel.findById(existingRole.permissionId);
                if (!permission) {
                    return res.status(404).send({ message: "Associated permission not found." });
                }
    
                const updatedPermissionConfig = { ...permission.permissionConfig };
                for (const key in updatedPermissionConfig) {
                    if (updatedPermissionConfig[key]) {
                        updatedPermissionConfig[key].view = roleView ?? updatedPermissionConfig[key].view;
                        updatedPermissionConfig[key].create = roleCreate ?? updatedPermissionConfig[key].create;
                        updatedPermissionConfig[key].edit = roleEdit ?? updatedPermissionConfig[key].edit;
                        updatedPermissionConfig[key].delete = roleDelete ?? updatedPermissionConfig[key].delete;
                    }
                }
                let permissionUpdate= await permissionModel.updateOne(
                    { _id:existingRole.permissionId },
                    { $set: { permissionConfig: updatedPermissionConfig, updatedAt: new Date() } }
                );
    
            if (!data) {
                return res.send(Response.FailResp(`You are not allowed to update records created by someone else.`));
            }
        }
            return res.send(Response.SuccessResp(RolesMessageNew['ROLES_UPDATE_SUCCESS'][language ?? 'en'], data));
        } catch (err) {
            console.log(err);
            return res.send(Response.userFailResp('Invalid roleId', err))
        }
    }

    async delete(req, resp) {
        try {

            const result = req.verified;
            let { orgId } = result?.userData;
            const roleId = req?.query?.roleId;

            const roleData = await rolesModel.findOne({ _id: roleId, orgId: orgId })
            // if(roleData?.is_default){
            //     return resp.send(Response.FailResp('Default roles cannot be deleted',"Validation failed"))
            // }

            if (!roleData) return resp.send(Response.FailResp('No role found'))
            // const resultData = await rolesModel.findOneAndUpdate({ _id: roleId }, {$set:{softDelete:true}}, { returnDocument: 'after' })

            const deleteRole = await rolesModel.deleteOne({ _id: roleId });
            const deletePermission = await permissionModel.deleteOne({ _id: roleData.permissionId });

            // let adminRole = await rolesModel.findOne({ roleName: 'read', adminId: roleData.adminId });

            //Update users having deleted role to 'admin' role
                await userSchema.updateMany(
                { roleIds: roleId },
                {
                    $set: { 
                    roleIds: null,
                    permission: null
                    }
                }
                );



            if (deleteRole) return resp.send(Response.userSuccessResp('Role Deleted successfully', deleteRole))
            return resp.send(Response.userFailResp('Error while deleting roles'))

        } catch (err) {
            console.log(err);
           return resp.send(Response.userFailResp('Something went wrong', err))
        }
    }

}

export default new RolesServices()