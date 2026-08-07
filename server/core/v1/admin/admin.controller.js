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

  async getAllowedDetections(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Get allowed detection types for the authenticated admin'
    #swagger.responses[200] = { description: 'Allowed detections fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.getAllowedDetections(req, res, next);
  }

  async updateAllowedDetections(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Set allowed detections and optional custom display names for a specific admin. Pass empty object {} to allow all with default names.'
    #swagger.parameters['data'] = {
        in: 'body',
        required: true,
        schema: {
          targetAdminId: 'string',
          detectionConfig: {
            personalProtectiveEquipmentSettings: 'Personal Protective Equipment Detection',
            crowdDetectionSettings: 'Crowd Detection',
            doorDetectionSettings: 'Door Detection',
            lightDetectionSettings: 'Light Detection',
            lineCrossingSettings: 'Line Crossing Detection',
            vehicleDetectionSettings: 'ANPR Detection',
            vehicleObstructionSettings: 'Vehicle & Obstruction Detection',
            deskAbsenceSettings: 'Desk Absence Detection',
            guardAbsenceSettings: 'Guard Absence Detection',
            countVehiclesSettings: 'Count Vehicles Detection',
            unauthorizedAccessSettings: 'Intrusion Detection',
            vehicleTypeDetectionSettings: 'Vehicle Type Detection',
            loiteringDetectionSettings: 'Loitering Detection',
            tableOccupancyDetectionSettings: 'Table Occupancy Detection',
            foodServicePPEDetection: 'Food Service PPE Detection'
          }
        }
    }
    #swagger.responses[200] = { description: 'Allowed detections updated successfully' }
    #swagger.responses[400] = { description: 'Validation error' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateAllowedDetections(req, res, next);
  }

  async getAlertSwitches(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Get global email and telegram alert switches for the authenticated admin'
    #swagger.responses[200] = { description: 'Alert switches fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.getAlertSwitches(req, res, next);
  }

  async updateEmailAlertsEnabled(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Globally enable or disable email alerts for the authenticated admin'
    #swagger.parameters['data'] = {
        in: 'body',
        required: true,
        schema: {
          emailAlertsEnabled: true
        }
    }
    #swagger.responses[200] = { description: 'Email alerts switch updated successfully' }
    #swagger.responses[400] = { description: 'Validation error' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateEmailAlertsEnabled(req, res, next);
  }

  async updateTelegramAlertsEnabled(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Globally enable or disable telegram alerts for the authenticated admin'
    #swagger.parameters['data'] = {
        in: 'body',
        required: true,
        schema: {
          telegramAlertsEnabled: true
        }
    }
    #swagger.responses[200] = { description: 'Telegram alerts switch updated successfully' }
    #swagger.responses[400] = { description: 'Validation error' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateTelegramAlertsEnabled(req, res, next);
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

  async getTimezones(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Get all IANA timezones for the timezone dropdown. Optional ?search filters by case-insensitive substring.'
    #swagger.parameters['search'] = { in: 'query', type: 'string', description: 'Case-insensitive substring filter, e.g. asia' }
    #swagger.responses[200] = { description: 'Timezones fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.getTimezones(req, res, next);
  }

  async updateTimezone(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Save the admin selected IANA timezone'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Selected IANA timezone',
        required: true,
        schema: { $ref: "#/definitions/updateTimezone" }
    }
    #swagger.responses[200] = { description: 'Timezone updated successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateTimezone(req, res, next);
  }

  async fetchTimezone(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Fetch the admin currently saved timezone'
    #swagger.responses[200] = { description: 'Timezone fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.fetchTimezone(req, res, next);
  }

  async updateStreamHost(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Set or clear a target admin RTSP stream host override. Pass streamHost null or empty to revert to the global host.'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Target admin user_id and streamHost',
        required: true,
        schema: { $ref: "#/definitions/updateStreamHost" }
    }
    #swagger.responses[200] = { description: 'streamHost updated successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateStreamHost(req, res, next);
  }

  async updateRetention(req, res, next) {
    /* #swagger.tags = ['Admin']
    #swagger.description = 'Set or clear a target admin data retention overrides. Only keys present in the body change; pass null to revert a key to the global DataRetention config.'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Target admin user_id and any of enabled, incidents, attendance, accessLogs, batchSize, maxRunMinutes, intervalHours',
        required: true,
        schema: { $ref: "#/definitions/updateRetention" }
    }
    #swagger.responses[200] = { description: 'Retention config updated successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return await adminService.updateRetention(req, res, next);
  }

}

export default new AdminController();
