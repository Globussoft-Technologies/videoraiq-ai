import JobsService from "./jobs.service.js";
class JobsController {
  async mockCreateJobs(req, res, next) {
    /* #swagger.tags = ['Jobs']
       #swagger.description = 'Mock jobs'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Profile details',
           required: true,
           schema: { $ref: "#/definitions/mockJobs" }
       }
       #swagger.responses[201] = {
           description: 'Jobs mocked successfully'
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
    return JobsService.mockCreateJobs(req, res, next);
  }
  async mockDeleteAllJobs(req, res, next) {
    /* #swagger.tags = ['Jobs']
       #swagger.description = 'Delete all jobs'
       #swagger.responses[201] = {
           description: 'All jobs deleted successfully'
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
    return JobsService.mockDeleteAllJobs(req, res, next);
  }
}

export default new JobsController();
