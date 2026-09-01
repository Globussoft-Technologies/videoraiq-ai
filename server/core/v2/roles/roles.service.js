import Response from "../../../utils/response.js";
import rolesModel from "./roles.model.js";
import RoleValidation from './roles.validate.js';
import {RolesMessageNew,PermissionMiddlewareMessage} from '../../../language/language.translator.js';
import { completeConfig, adminConfig, readConfig, writeConfig } from './../permission/permissions.config.js';
import { reconcileDefaultRoles } from './defaultRoles.sync.js';
import logger from "../../../utils/logger.js";
import permissionModel from "../permission/permissions.model.js";
import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;
import userModel from "../authorizedUsers/authorizedUsers.model.js";
import adminModel from "../admin/admin.model.js";
import userSchema from "../../v1/users/users.model.js"


class RolesServices{

    async createRoles(req, resp) {
        try {
            const data = req.body;
            const result = req.verified;
            let { orgId ,_id,adminId} = result?.userData;

            const rolesDetails = (data?.roles).map(role => String(role).trim());
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
                    await Promise.all(newRole.map(async role_new => {
                        let roles = {
                            adminId: adminId,
                            roleName: role_new,
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
                    }));
                    if (existRole.length) {
                        return newRole.length
                            ? resp.send(Response.SuccessResp(`${newRole} ${RolesMessageNew['ROLES_ADD_SUCCESS']['en']} ${existRole} ${RolesMessageNew['ROLES_EXIST']['en']}`))
                            : resp.send(Response.FailResp(`${existRole} ${RolesMessageNew['ROLES_EXIST']['en']} `));
                    } else {
                        return resp.send(Response.SuccessResp(`${newRole} ${RolesMessageNew['ROLES_ADD_SUCCESS']['en']}`));
                    }
                } catch (error) {
                    logger.error(`Error while inserting new Roles ${error.message}`);
                    return resp.send(Response.FailResp(`Error while inserting new Roles: ${error.message}`));
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
                    // NOTE: `role` doesn't exist on the authorizedUsers schema — this match is
                    // currently always empty (pre-existing, unrelated to suspension). `status`
                    // filter added defensively for when that's fixed.
                    const assignedRole = await userModel.aggregate([{ $match: { $and: [{ role: role }, { status: { $ne: 'suspended' } }] } }, {
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
                        // NOTE: `roleId` doesn't exist on the authorizedUsers schema — see the
                        // matching note above. `status` filter added defensively.
                        let assignedRole = await userModel.aggregate([{ $match:  {roleId: temp?._id, status: { $ne: 'suspended' }}},
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
            const roleValue = role.roleName?.trim();
            const { value,error } = RoleValidation.updateRole(role);
            if (error) {
                return res.send(Response.FailResp(RolesMessageNew['VALIDATION_FAIL'][language ?? 'en'], error.message));
            }

            const excludedRoleId = new ObjectId(roleId);
            const isRoleExist = await rolesModel.aggregate([
                { $match: { adminId: new ObjectId(adminId), _id: { $ne: excludedRoleId } } }
            ]);
            const userRoles = isRoleExist.map(item => item.roleName?.trim().toLowerCase());
            const isRoleDuplicate = userRoles.includes(roleValue?.toLowerCase());
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
                        // Handle nested logs structure separately
                        if (key === 'logs' && typeof updatedPermissionConfig[key] === 'object') {
                            for (const subKey in updatedPermissionConfig[key]) {
                                if (updatedPermissionConfig[key][subKey]) {
                                    updatedPermissionConfig[key][subKey].view = roleView ?? updatedPermissionConfig[key][subKey].view;
                                    updatedPermissionConfig[key][subKey].create = roleCreate ?? updatedPermissionConfig[key][subKey].create;
                                    updatedPermissionConfig[key][subKey].edit = roleEdit ?? updatedPermissionConfig[key][subKey].edit;
                                    updatedPermissionConfig[key][subKey].delete = roleDelete ?? updatedPermissionConfig[key][subKey].delete;
                                }
                            }
                        } else {
                            // Handle flat structure for other modules
                            updatedPermissionConfig[key].view = roleView ?? updatedPermissionConfig[key].view;
                            updatedPermissionConfig[key].create = roleCreate ?? updatedPermissionConfig[key].create;
                            updatedPermissionConfig[key].edit = roleEdit ?? updatedPermissionConfig[key].edit;
                            updatedPermissionConfig[key].delete = roleDelete ?? updatedPermissionConfig[key].delete;
                        }
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

    /**
     * Re-apply the canonical DEFAULT_ROLE_PRESETS to this admin's three default
     * roles (admin / read / write).
     *
     * Why this exists: the default roles are written once, at provisioning, from
     * the templates in permissions.config.js. When a new module ships (carLogs
     * being the case that prompted this) the templates gain it but every
     * already-provisioned tenant keeps the permissionConfig it was seeded with.
     * Those roles are locked in the UI and refused by PermissionService
     * .updatePermissions, so there is no way to fix them by hand — hence a
     * dedicated endpoint.
     *
     * The template is re-applied WHOLESALE rather than merged: a default role is
     * meant to BE the canonical matrix, so anything that drifted from it is
     * drift to correct. `dryRun` reports the same diff without writing, which is
     * what the confirmation dialog shows before the user commits.
     */
    async syncDefaultRoles(req, res) {
        const result = req.verified;
        const { adminId, user_id } = result?.userData ?? {};
        const dryRun = req?.query?.dryRun === "true" || req?.body?.dryRun === true;

        try {
            if (!adminId) {
                return res.send(Response.FailResp(RolesMessageNew["ADMIN_NOT_EXIST"]["en"], null));
            }
            const isAdminExist = await adminModel.findOne({ _id: adminId });
            if (!isAdminExist) {
                return res.send(Response.FailResp(RolesMessageNew["ADMIN_NOT_EXIST"]["en"], null));
            }

            // The route already gates on roles.edit. This rewrites permission
            // documents too, so it additionally needs permission.edit — the same
            // right PermissionService.updatePermissions demands for the granular
            // editor. Sub-users carry their config on the token; an admin has no
            // such array and is unrestricted.
            const tokenPermission = result?.permissionConfig?.[0]?.permissionConfig;
            if (tokenPermission && !tokenPermission?.permission?.edit) {
                return res.status(400).send(Response.accessDeniedResp(
                    `${PermissionMiddlewareMessage["EDIT_ACCESS_DENIED"]["en"]} permission module.`,
                ));
            }

            const { rolesTouched, modules, roles } = await reconcileDefaultRoles({
                adminId,
                userId: user_id ?? null,
                dryRun,
            });

            logger.info(
                `[ROLES] sync-defaults${dryRun ? " (dry run)" : ""} admin=${adminId} ` +
                `roles=${rolesTouched}/${roles.length} modules=${modules}`,
            );

            return res.send(Response.userSuccessResp(
                dryRun
                    ? "Default role differences calculated."
                    : (rolesTouched
                        ? "Default roles synced successfully."
                        : "Default roles are already up to date."),
                { dryRun, rolesTouched, modules, roles },
            ));
        } catch (err) {
            logger.error(`Error while syncing default roles ${err.message}`);
            return res.send(Response.FailResp("Unable to sync default roles.", err.message));
        }
    }

}

export default new RolesServices()
