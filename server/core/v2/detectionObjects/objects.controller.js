import ObjectsService from './objects.service.js';
class ObjectsController {
  async createDetectionObjects(req, res, next) {
    /* #swagger.tags = ['Detection Objects']
       #swagger.description = 'Add a new objects'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Object details',
           required: true,
           schema: { $ref: "#/definitions/addObjects" }
       }
       #swagger.responses[201] = {
           description: 'Objects added successfully'
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
    return ObjectsService.createDetectionObjects(req, res, next);
  }

  async getAllObjects(req, res, next) {
    /* #swagger.tags = ['Detection Objects']
       #swagger.description = 'Get all detection objects'
       #swagger.responses[200] = {
           description: 'List of detection objects retrieved successfully'
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
    return ObjectsService.getAllObjects(req, res, next);
  }

  async deleteDetectionObjects(req, res, next) {
    /* #swagger.tags = ['Detection Objects']
       #swagger.description = 'Delete detection objects'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Object details to delete',
           required: true,
           schema: { $ref: "#/definitions/deleteObjects" }
       }
       #swagger.responses[200] = {
           description: 'Objects deleted successfully'
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
    return ObjectsService.deleteDetectionObjectsByType(req, res, next);
  }
}

export default new ObjectsController();
