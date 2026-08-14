import GlobalScheduleService from "./globalSchedule.service.js";

class GlobalScheduleController {
  async getNvrCameras(req, res, next) {
    /* #swagger.tags = ['Global Schedule']
       #swagger.description = 'Get an NVR with its cameras split into configured (eligible for global detection scheduling) and non-configured'
       #swagger.responses[200] = {
           description: 'NVR cameras fetched successfully'
       }
       #swagger.responses[404] = {
           description: 'NVR not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return GlobalScheduleService.getNvrCameras(req, res, next);
  }

  async createGlobalSchedule(req, res, next) {
    /* #swagger.tags = ['Global Schedule']
       #swagger.description = 'Create an NVR-level global detection schedule'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Global schedule details',
           required: true
       }
       #swagger.responses[201] = {
           description: 'Global schedule created successfully'
       }
       #swagger.responses[400] = {
           description: 'Validation error'
       }
       #swagger.responses[404] = {
           description: 'NVR not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return GlobalScheduleService.createGlobalSchedule(req, res, next);
  }

  async getAllGlobalSchedules(req, res, next) {
    /* #swagger.tags = ['Global Schedule']
       #swagger.description = 'List global detection schedules, optionally filtered by nvrId'
       #swagger.responses[200] = {
           description: 'Global schedules fetched successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return GlobalScheduleService.getAllGlobalSchedules(req, res, next);
  }

  async getGlobalSchedule(req, res, next) {
    /* #swagger.tags = ['Global Schedule']
       #swagger.description = 'Get one global detection schedule'
       #swagger.responses[200] = {
           description: 'Global schedule fetched successfully'
       }
       #swagger.responses[404] = {
           description: 'Global schedule not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return GlobalScheduleService.getGlobalSchedule(req, res, next);
  }

  async updateGlobalSchedule(req, res, next) {
    /* #swagger.tags = ['Global Schedule']
       #swagger.description = 'Update a global detection schedule. cameras[].enabled is enrolment, not runtime state'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Fields to update',
           required: true
       }
       #swagger.responses[200] = {
           description: 'Global schedule updated successfully'
       }
       #swagger.responses[400] = {
           description: 'Validation error'
       }
       #swagger.responses[404] = {
           description: 'Global schedule not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return GlobalScheduleService.updateGlobalSchedule(req, res, next);
  }

  async deleteGlobalSchedule(req, res, next) {
    /* #swagger.tags = ['Global Schedule']
       #swagger.description = 'Delete a global detection schedule; covered cameras revert to their camera-specific schedules'
       #swagger.responses[200] = {
           description: 'Global schedule deleted successfully'
       }
       #swagger.responses[404] = {
           description: 'Global schedule not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return GlobalScheduleService.deleteGlobalSchedule(req, res, next);
  }
}

export default new GlobalScheduleController();
