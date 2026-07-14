import recipientsService from "./recipients.service.js";

class recipientsController {
    async createRecipients(req, res, next) {
        /* #swagger.tags = ['Recipients']
           #swagger.description = 'This route is used to create Recipients.' */
    
        /* #swagger.parameters['alertType'] = {
              in: 'query',
              description: 'Provide alertType',
              required: true,
              type: 'string',
              enum: ['email', 'phoneNumber']
        } */
    
        /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Recipients email or phoneNumber',
              required: true,
              schema: { $ref: "#/definitions/createRecipients" }
        } */
    
        return await recipientsService.createRecipients(req, res, next);
      }


      async verify(req,res,next){
        /* #swagger.tags = ['Recipients']
           #swagger.description = 'This route is used to verify Recipients.' */
    
        /* #swagger.parameters['alertType'] = {
              in: 'query',
              description: 'Provide alertType',
              required: true,
              type: 'string',
              enum: ['email', 'phoneNumber']
        } */
      /* #swagger.parameters['otp'] = {
              in: 'query',
              description: 'Provide OTP',
              required: true,
              type: 'string',
        } */
        /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Recipients email or phoneNumber',
              required: true,
              schema: { $ref: "#/definitions/createRecipients" }
        } */
      return await recipientsService.verify(req, res, next);
      }
      async resendMailOrSMS(req,res,next){
        /* #swagger.tags = ['Recipients']
           #swagger.description = 'This route is used to resend mail or SMS to  Recipients.' */
    
        /* #swagger.parameters['alertType'] = {
              in: 'query',
              description: 'Provide alertType',
              required: true,
              type: 'string',
              enum: ['email', 'phoneNumber']
        } */
      /* #swagger.parameters['id'] = {
              in: 'query',
              description: 'Provide _id of the Recipient',
              required: true,
              type: 'string',
        } */
        /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Recipients email or phoneNumber',
              required: true,
              schema: { $ref: "#/definitions/recentMailOrSMS" }
        } */
        return await recipientsService.resendMailOrSMS(req,res,next);
      }
      async fetchRecipients(req,res,next){
        /* #swagger.tags = ['Recipients']
           #swagger.description = 'This route is used to verify Recipients.' */
        /* #swagger.parameters['alertType'] = {
              in: 'query',
              description: 'Provide alertType',
              required: true,
              type: 'string',
              enum: ['email', 'phone']
        } */
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
    /*#swagger.parameters['orderBy'] = {
                            in: 'query',
                            description: 'keyword to be ordered',
                            enum: ['value','fullName','createdAt', 'updatedAt'],
        }
    #swagger.parameters['sort'] = {
                            in: 'query',
                            description: 'sorting parameters(asc or desc)',
                            enum: ['asc', 'desc'],
    }  */
       /* #swagger.parameters['filterByStatus'] = {
              in: 'query',
              description: 'Provide Limit',
              required: false,
              type: 'string',
              enum: ['All','verified', 'unverified']
        } */ 
      /* #swagger.parameters['search'] = {
              in: 'query',
              description: 'Provide Limit',
              required: false,
              type: 'string',
        } */ 

      return await recipientsService.fetchRecipients(req, res, next);

      }
      async deleteRecipients(req,res,next){
        /* #swagger.tags = ['Recipients']
           #swagger.description = 'This route is used to delete Recipients.' */
      /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Recipients email or phoneNumber',
              required: true,
              schema: { $ref: "#/definitions/deleteRecipients" }
        } */
      return await recipientsService.deleteRecipients(req, res, next);

      }
    

      async updateRecipient(req, res, next) {
        /* #swagger.tags = ['Recipients']
           #swagger.description = 'This route is used to update recipient fullName and incidentTypes.' */
        /* #swagger.parameters['id'] = {
              in: 'query',
              description: 'Provide _id of the Recipient',
              required: true,
              type: 'string',
        } */
        /* #swagger.parameters['data'] = {
              in: 'body',
              description: 'Fields to update',
              required: true,
              schema: { $ref: "#/definitions/updateRecipient" }
        } */
        return await recipientsService.updateRecipient(req, res, next);
      }
}
export default new recipientsController();
