
import RolesService from "./roles.service.js";
class RolesController{
    async createRoles(req,res,next){
        /* #swagger.tags = ['Roles']
                            #swagger.description = 'This routes is used for creating the Roles' */
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'Role Details',
                                required: true,
                                schema: { $ref: "#/definitions/CreateRoles" }
        } */
        return await RolesService.createRoles(req, res, next);
    }

    
    async get(req, res, next) {
        /* #swagger.tags = ['Roles']
                           #swagger.description = 'This routes is used for fetch the roles' */
        /* #swagger.parameters['roleName'] = {
                                in: 'query',
                                description: 'RoleName Values',                  
                        } */
        /* #swagger.parameters['custom'] = {
                                 in: 'query',
                                 description: 'select RoleType',  
                                 enum: [true, false],        
        } */
        /*	#swagger.parameters['skip'] = {
                           in: 'query',
                           type: 'integer',
                           minimum: 0,
                           description: 'Skip Values',
        } */
        /*	#swagger.parameters['limit'] = {
                            in: 'query',
                            type: 'integer',
                             minimum: 0,
                            description: 'results limit',
        } */
        /*	#swagger.parameters['orderBy'] = {
                             in: 'query',
                             description: 'keyword to be ordered',
        } */
        /*	#swagger.parameters['sort'] = {
                            in: 'query',
                            description: 'sorting parameters(asc or desc)',
                            enum: ['asc', 'desc'],
        } */      
        return await RolesService.get(req, res, next)
    }

    async update(req, res, next) {
        /* #swagger.tags = ['Roles']
                           #swagger.description = 'This routes is used for update the roles' */
        /*	    #swagger.parameters['roleId'] = {
                 in: 'query',
                 required: true
        }*/
        /*	    #swagger.parameters['roleName'] = {
                  in: 'body',
                  required: true,
                  schema: { $ref: "#/definitions/UpdateRoleName" }
        }*/
        return await RolesService.update(req, res, next);
    }

    async syncDefaultRoles(req, res, next) {
        /* #swagger.tags = ['Roles']
                            #swagger.description = 'Re-applies the canonical permission templates to the three default roles (admin/read/write). Use after a new module ships, since default roles are seeded once at provisioning and cannot be edited by hand.' */
        /* #swagger.parameters['dryRun'] = {
              in: 'query',
              description: 'When true, report what would change without writing anything.',
              enum: ['true', 'false'],
      }*/
        return await RolesService.syncDefaultRoles(req, res, next);
    }

    async delete(req, res, next) {
        /* #swagger.tags = ['Roles']
                            #swagger.description = 'This routes is used to delete the Role' */
        /* #swagger.parameters['roleId'] = {
              in: 'query',
              required: true
      }*/
        return await RolesService.delete(req, res, next);
    }
}

export default new RolesController();