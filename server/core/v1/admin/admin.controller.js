import adminService from "./admin.service.js";
class AdminController {
  async signUP(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Update specific fields of a camera channel'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/adminSignup" }
    }
    #swagger.responses[200] = {
        description: 'Admin Added successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    */
    /*#swagger.security = [] */
    return await adminService.signUP(req, res, next);
  }

    async updateAdmin(req,res,next){
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Update specific fields of a camera channel'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/updateAdmin" }
    }
    #swagger.responses[200] = {
        description: 'Admin updated successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    */
    /*#swagger.security = [] */
    return await adminService.updateAdmin(req, res, next);
  }

  async fetch(req,res,next){
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Update specific fields of a camera channel'
    #swagger.responses[200] = {
        description: 'Admin details fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    */
    return await adminService.fetch(req, res, next);
  }

  async getEmpEmployees(req,res,next){
    /* #swagger.tags = ['Admin']
    #swagger.description = 'All EMP Employees'
    #swagger.parameters['skip'] = {
              in: 'query',
              description: 'Provide Skip',
              required: true,
              type: 'string',
        } 
    #swagger.parameters['limit'] = {
              in: 'query',
              description: 'Provide Limit',
              required: true,
              type: 'string',
    } 
    #swagger.responses[200] = {
        description: 'Admin details fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    */
    return await adminService.getEmpEmployees(req, res, next);

  }

  async importEMPUsers(req,res,next){
        /* #swagger.tags = ['Admin']
    #swagger.description = 'All EMP Employees'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/importEMPUsers" }
    }
    #swagger.responses[200] = {
        description: 'Admin details fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    */
    return await adminService.importEMPUsers(req, res, next);

  }

  async addEMPEmails(req,res,next){
    /* #swagger.tags = ['Admin']
    #swagger.description = 'All EMP Employees'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/addEMPEmails" }
    }
    #swagger.responses[200] = {
        description: 'Admin details fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    */
    return await adminService.addEMPEmails(req, res, next);

  }


  async getEMPEmails(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Get all EMP email entries from Admin empData'
    #swagger.responses[200] = { description: 'EMP emails fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.getEMPEmails(req, res, next);
  }

  async updateEMPEmail(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Update an EMP email entry (oldEmail -> newEmail) in Admin empData'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'oldEmail and newEmail',
        required: true,
        schema: { $ref: "#/definitions/updateEMPEmail" }
    }
    #swagger.responses[200] = { description: 'EMP email updated successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateEMPEmail(req, res, next);
  }

  async deleteEMPEmail(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Delete an EMP email entry from Admin empData'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'email to delete',
        required: true,
        schema: { $ref: "#/definitions/deleteEMPEmail" }
    }
    #swagger.responses[200] = { description: 'EMP email deleted successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.deleteEMPEmail(req, res, next);
  }

  async getLocationByEmpEmail(req,res,next){
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Get location by EMP email'
    #swagger.responses[200] = { description: 'EMP location fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.getLocationByEmpEmail(req, res, next);
  }

  async getDeletionProgress(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Get deletion progress for EMP email'
    #swagger.parameters['email'] = {
        in: 'query',
        description: 'email to check progress for',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = { description: 'Progress fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.getDeletionProgress(req, res, next);
  }

  async updateLogsSound(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Update logsSound preferences for Admin or User'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'logsSound boolean flag',
        required: true,
        schema: { $ref: "#/definitions/updateLogsSound" }
    }
    #swagger.responses[200] = { description: 'logsSound updated successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateLogsSound(req, res, next);
  }

  async fetchLogsSound(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Fetch logsSound preferences for Admin or User'
    #swagger.responses[200] = { description: 'logsSound fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.fetchLogsSound(req, res, next);
  }

}

export default new AdminController();
