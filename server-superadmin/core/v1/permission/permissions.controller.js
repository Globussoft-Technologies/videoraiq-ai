import PermissionService from './permissions.utility.js';

class PermissionController {
    async create(req, res, next) {
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for create the Permissions' */
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'User Details',
                                required: true,
                                schema: { $ref: "#/definitions/CreatePermissions" }
        }*/
        return await PermissionService.create(req, res, next);
    }

    async fetchPermissions(req, res, next) {
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for fetch the Permissions' */
        /*	#swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            minimum: 0,
                            description: 'Skip Values',
        }*/
         /* #swagger.parameters['permissionId'] = {
                                 in: 'query',
                                 description: 'Provide PermissionId',  
        } */
        /*	#swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            minimum: 0,
                            description: 'results limit',
        }*/
        /*	#swagger.parameters['orderBy'] = {
                            in: 'query',
                            description: 'keyword to be ordered',
                            enum: ['permissionName', 'is_default', 'createdAt', 'updatedAt'],
        }*/
        /*	#swagger.parameters['sort'] = {
                            in: 'query',
                            description: 'sorting parameters(asc or desc)',
                            enum: ['asc', 'desc'],
        }*/
        return await PermissionService.fetchPermissions(req, res, next);
    }

    async updatePermissions(req, res, next) {
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for Update the Permissions' */
        /*	    #swagger.parameters['permissionId'] = {
                 in: 'query',
                 required: true
        }*/
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'User Details',
                                required: true,
                                schema: { $ref: "#/definitions/UpdatePermission" }
        }*/

        return await PermissionService.updatePermissions(req, res, next);
    }

    async deletePermissions(req, res, next) {
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for delete the Permissions' */
        /*	    #swagger.parameters['permissionId'] = {
                 in: 'query',
                 required: false
        } */
        return await PermissionService.deletePermissions(req, res, next);
    }

    async fetchRolesPermission(req, res, next){
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for Fetching the Permissions' */

    /*	#swagger.parameters['searchQuery'] = {
                            in: 'query',
                            description: 'Provide SearchQuery',
        } */         
                 /*	#swagger.parameters['skip'] = {
                                      in: 'query',
                                      description: 'skip values',
                                      required: false,
                                      type: 'integer',
            }*/
        /*	#swagger.parameters['limit'] = {
                                      in: 'query',
                                      description: 'limit values',
                                      required: false,
                                      type: 'integer',
        }*/
        /*	#swagger.parameters['orderBy'] = {
                             in: 'query',
                             description: 'keyword to be ordered',
                             enum: ['roleName','createdAt','view','create','edit','delete'],
        } */          
        /*	#swagger.parameters['sort'] = {
                        in: 'query',
                        description: 'sorting parameters(asc or desc)',
                        enum: ['asc', 'desc'],
    }*/   
        /*	#swagger.parameters['data'] = {
                                 in: 'body',
                                 description: 'Admin Email Verification',
                                 required: true,
                                 schema: { $ref: "#/definitions/rolesPermissions" }
        }*/           
        return await PermissionService.fetchRolesPermission(req,res,next);
    }

    async bulkPermissionUpdate(req,res,next){
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for Fetching the Permissions' */
        /*	#swagger.parameters['data'] = {
                                 in: 'body',
                                 description: 'User PermissionConfig Update',
                                 required: true,
                                 schema: { $ref: "#/definitions/bulkUpdatePermission" }
        }*/ 
        return await PermissionService.bulkPermissionUpdate(req,res,next);               
    }

    async bulkPermissionDelete(req,res,next){
        /* #swagger.tags = ['Permissions']
                           #swagger.description = 'This routes is used for Fetching the Permissions' */
        /*	#swagger.parameters['data'] = {
                                 in: 'body',
                                 description: 'User PermissionConfig Delete',
                                 required: true,
                                 schema: { $ref: "#/definitions/bulkDeletePermission" }
        }*/   
        return await PermissionService.bulkPermissionDelete(req,res,next);                  
    }

    async userPermissions(req,res,next){
        /* #swagger.tags = ['User_Permissions']
                           #swagger.description = 'This routes is used for Fetching the Permissions' */
       return await PermissionService.userPermissions(req,res,next);             
    }

    async updateAdminPermissions(req, res, next) {
        /* #swagger.tags = ['Permissions']
           #swagger.description = 'Update all permission configs of a specific admin, syncing roles'
           
                   /*	#swagger.parameters['data'] = {
                                 in: 'body',
                                 description: 'User PermissionConfig Delete',
                                 required: true,
                                 schema: { $ref: "#/definitions/updateAdminPermissions" }
        }*/ 
        return await PermissionService.updateAdminPermissions(req, res, next);
    }
}
export default new PermissionController();
