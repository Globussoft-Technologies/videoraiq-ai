import logsConfigService from "./logsConfiguration.service.js";

class LogsConfigurationController {
  async getLogsConfiguration(req, res, next) {
    /*
    #swagger.tags = ['LogsConfiguration']
    #swagger.description = 'Get logs configuration for the current admin'
    #swagger.responses[200] = {
      description: 'Logs configuration fetched successfully',
      schema: {
        attendanceLogs: true,
        accessLogs: true,
        taggedUsers: true,
        detectedUsers: true,
        personCountLogs: true,
        deskAbsenceLogs: true,
        anprLogs: true,
        trackLogs: true,
        visibilityLogs: true,
        guardLogs: true,
        conveyorLogs: true,
        vehicleObstructionLogs: true,
        vehicleCountLogs: true,
        carLogs: true,
        crusherLogs: true,
        lineCrossingLogs: true,
        waterSpillLogs: true,
        unauthorizedAccessLogs: true
      }
    }
    #swagger.responses[400] = { description: 'Missing adminId' }
    #swagger.responses[404] = { description: 'Admin not found' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return logsConfigService.getLogsConfiguration(req, res, next);
  }

  async updateLogsConfiguration(req, res, next) {
    /*
    #swagger.tags = ['LogsConfiguration']
    #swagger.description = 'Update logs configuration for the current admin'
    #swagger.parameters['data'] = {
      in: 'body',
      required: true,
      schema: {
        logs: {
          attendanceLogs: true,
          accessLogs: false
        }
      }
    }
    #swagger.responses[200] = { description: 'Logs configuration updated successfully' }
    #swagger.responses[400] = { description: 'Invalid request body' }
    #swagger.responses[404] = { description: 'Admin not found' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return logsConfigService.updateLogsConfiguration(req, res, next);
  }
}

export default new LogsConfigurationController();
