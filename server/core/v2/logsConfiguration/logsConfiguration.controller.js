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
        sleepActivityLogs: true,
        measurementLogs: true,
        conveyorLogs: true,
        vehicleObstructionLogs: true,
        unauthorizedParkingLogs: true,
        vehicleCountLogs: true,
        carLogs: true,
        vehicleCheckInOutLogs: true,
        crusherLogs: true,
        cylinderLogs: true,
        lineCrossingLogs: true,
        waterSpillLogs: true,
        unauthorizedAccessLogs: true,
        workingAtHeightLogs: true,
        oilLeakageLogs: true,
        wrongLocationLogs: true,
        wasteDisposalLogs: true,
        animalEntryLogs: true,
        messyAreaLogs: true
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
          accessLogs: false,
          workingAtHeightLogs: true,
          oilLeakageLogs: true,
          wrongLocationLogs: true,
          wasteDisposalLogs: true,
          animalEntryLogs: true,
          messyAreaLogs: true
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
