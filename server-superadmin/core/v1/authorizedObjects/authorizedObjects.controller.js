
import authorizedObjectsService from "./authorizedObjects.service.js";


class authorizedObjectsController {
    async createAuthorizedObjects(req,res,next){
        /* #swagger.tags = ['AuthorizedObjects']
           #swagger.description = 'Create authorized objects.'
           #swagger.parameters['data'] = {
               in: 'body',
               description: 'Authorized objects details',
               required: true,
               schema: { $ref: "#/definitions/createAuthorizedObjects" }
           }
           #swagger.responses[201] = {
               description: 'Authorized objects created'
           }
           #swagger.responses[400] = {
               description: 'Validation error or missing required fields'
           }
           #swagger.responses[500] = {
               description: 'Internal server error'
           }
            #swagger.security = [{
             "EncryptedAuthToken": []
          }]
        */


    return authorizedObjectsService.createAuthorizedObjects(req,res,next);
    }

    async fetchAuthorizedObjects(req,res,next){
        /* #swagger.tags = ['AuthorizedObjects']
           #swagger.description = 'Fetch authorized objects for the admin.'
            #swagger.security = [{
             "EncryptedAuthToken": []
          }]
            #swagger.parameters['data'] = {
               in: 'body',
               description: 'Authorized objects details',
               required: true,
               schema: { $ref: "#/definitions/fetchObjectTypes" }
           }

        */
    return authorizedObjectsService.fetchAuthorizedObjects(req,res,next);
    }

    async getAllObjectTypes(req,res,next){
        /* #swagger.tags = ['AuthorizedObjects']
           #swagger.description = 'Get all authorized object types for the admin.'
            #swagger.security = [{
             "EncryptedAuthToken": []
          }]
        */
    return authorizedObjectsService.getAllObjectTypes(req,res,next);
    }

    async updateAuthorizedObjects(req,res,next){
        /* #swagger.tags = ['AuthorizedObjects']
           #swagger.description = 'Update authorized objects for the admin.'
            #swagger.security = [{
             "EncryptedAuthToken": []
          }]
            #swagger.parameters['data'] = {
               in: 'body',
               description: 'Authorized objects details',
               required: true,
               schema: { $ref: "#/definitions/updateAuthorizedObjects" }
           }

        */
    return authorizedObjectsService.updateAuthorizedObjects(req,res,next);
    }

    async deleteAuthorizedObjects(req,res,next){
        /* #swagger.tags = ['AuthorizedObjects']
           #swagger.description = 'Delete authorized objects for the admin.'
            #swagger.security = [{
             "EncryptedAuthToken": []
          }]
        #swagger.parameters['id'] = {
            in: 'query',
            description: 'Provide authorized object id to delete',
            required: true,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }

        */
    return authorizedObjectsService.deleteAuthorizedObjects(req,res,next);
    }


}

export default new authorizedObjectsController();