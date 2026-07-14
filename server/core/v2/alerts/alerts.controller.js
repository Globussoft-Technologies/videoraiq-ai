import alertsService from "./alerts.service.js";

class alertsController {
    async createAlert(req, res, next) {
        /* #swagger.tags = ['Alerts']
           #swagger.description = 'This route is used to create Alerts.' */
    
        /* #swagger.parameters['alertBasedOn'] = {
              in: 'query',
              description: 'Whether the alert is based on NVR or Camera',
              required: true,
              type: 'string',
              enum: ['NVR', 'Camera']
        } */
    
        /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Alert creation payload including emails, phoneNumbers, detectionTypes, etc.',
              required: true,
              schema: { $ref: "#/definitions/createAlert" }
        } */
    
        return await alertsService.createAlert(req, res, next);
      }

      async updateAlert(req,res,next){
        /* #swagger.tags = ['Alerts']
           #swagger.description = 'This route is used to update Alerts.' */

        /* #swagger.parameters['alertId'] = {
              in: 'query',
              description: 'Provide _id of Alert',
              required: true,
              type: 'string',
        } */ 
    
        /* #swagger.parameters['alertBasedOn'] = {
              in: 'query',
              description: 'Whether the alert is based on NVR or Camera',
              required: true,
              type: 'string',
              enum: ['NVR', 'Camera']
        } */
    
        /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Alert creation payload including emails, phoneNumbers, detectionTypes, etc.',
              required: true,
              schema: { $ref: "#/definitions/updateAlert" }
        } */
        return await alertsService.updateAlert(req, res, next);

      }

      async fetchAllAlerts(req,res,next){
        /* #swagger.tags = ['Alerts']
           #swagger.description = 'This route is used to get all Alerts.' */

        /* #swagger.parameters['skip'] = {
              in: 'query',
              description: 'Provide Skip',
              required: true,
              type: 'string',
        } */ 

        
        /* #swagger.parameters['limit'] = {
              in: 'query',
              description: 'Provide Limit',
              required: true,
              type: 'string',
        } */ 

      return await alertsService.fetchAllAlerts(req, res, next);
      }

      async deleteAlerts(req,res,next){
      /* #swagger.tags = ['Alerts']
           #swagger.description = 'This route is used to delete Alerts by id.' */

        /* #swagger.parameters['id'] = {
              in: 'query',
              description: 'Provide id',
              required: true,
              type: 'string',
        } */ 
      return await alertsService.deleteAlerts(req, res, next);
   
      }
    

}
export default new alertsController();
