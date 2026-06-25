import incidentsService from "./incidents.service.js";
class IncidentsController {
  async createIncidents(req, res, next) {
    /* 
    #swagger.tags = ['Incidents']
    #swagger.description = 'Create a new incident based on the incident type'

    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Incident creation payload based on incident type',
      required: true,
      schema: { $ref: '#/definitions/createIncidents' }
    }
    #swagger.responses[201] = {
      description: 'Incident created successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */

    return incidentsService.createIncidents(req, res, next);
  }
  async getAllIncidentsById(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get all camera channels by NVR ID (populated)'
    #swagger.parameters['channelId'] = {
                            in: 'query',
                            type:'String',
                            description: 'channelId',
    } 
    #swagger.parameters['incidentId'] = {
                            in: 'query',
                            type:'String',
                            description: 'channelId',
    } 
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            description:'limit',
    } 
    #swagger.responses[200] = {
        description: 'List of channels for given NVR'
    }
    #swagger.responses[400] = {
        description: 'Invalid NVR ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return incidentsService.getAllIncidentsById(req, res, next);
  }

  async getAllIncidents(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get all camera channels related to user'
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            description:'limit',
    } 
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: false,
        schema: { $ref: "#/definitions/getIncidentsFilter" }
    }
    #swagger.responses[200] = {
        description: 'List of channels for given NVR'
    }
    #swagger.responses[400] = {
        description: 'Invalid NVR ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return incidentsService.getAllIncidents(req, res, next);
  }

  async updateIncident(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Update specific fields of Incident'
    #swagger.parameters['id'] = {
        in: 'path',
        description: 'Incident ID',
        required: true,
        type: 'string'
    }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/updateIncident" }
    }
    #swagger.responses[200] = {
        description: 'Incident updated successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.updateIncident(req, res, next);
  }

  async deleteIncident(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Delete a Incident'
    #swagger.parameters['id'] = {
        in: 'path',
        description: 'Incident ID',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = {
        description: 'Incident deleted successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.deleteIncident(req, res, next);
  }

  async deleteIncidentsByIds(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Delete Incidents by IDs'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/deleteIncidentsByIds" }
    }
    #swagger.responses[200] = {
        description: 'Incidents deleted successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.deleteIncidentsByIds(req, res, next);
  }

  async getIncidentsDetails(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get a Incident'
    #swagger.parameters['search'] = {
                            in: 'query',
                            type:'string',
                            description:'provide search string',
    } 
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            description:'limit',
    } 
    #swagger.parameters['channelId'] = {
                            in: 'query',
                            type:'string',
                            description:'Provide channel _id',
    } 
    #swagger.parameters['nvrId'] = {
                            in: 'query',
                            type:'string',
                            description:'Provide nvr _id',
    } 
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/getIncidentsDetails" }
    }
    #swagger.responses[200] = {
        description: 'Incident fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.getIncidentsDetails(req, res, next);
  }
  async updateReportStatus(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Update report status of an Incident'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/updateReportStatus" }
    }
    #swagger.responses[200] = {
        description: 'Incident updated successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.updateReportStatus(req, res, next);
  }

  async getIncidentLists(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get list of Incidents'
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            description:'limit',
    } 
    #swagger.responses[200] = {
        description: 'Incident fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.getIncidentLists(req, res, next);
  }

  async deskAbsenceData(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get desk absence data'
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            description:'limit',
    } 
    #swagger.parameters['search'] = {
                            in: 'query',
                            type:'string',
                            description:'provide search string',
    }
    #swagger.parameters['isExport'] = {
                            in: 'query',
                            type:'string',
                            description:'set to true to export all data without pagination',
    }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/deskAbsenceData" }
    }
    #swagger.responses[200] = {
        description: 'Incident fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.deskAbsenceData(req, res, next);
  }

  async guardAbsenceData(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get guard absence data'
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'integer',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'integer',
                            description:'limit',
    } 
    #swagger.parameters['search'] = {
                            in: 'query',
                            type:'string',
                            description:'provide search string',
    }
    #swagger.parameters['isExport'] = {
                            in: 'query',
                            type:'string',
                            description:'set to true to export all data without pagination',
    }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/guardAbsenceData" }
    }
    #swagger.responses[200] = {
        description: 'Incident fetched successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await incidentsService.guardAbsenceData(req, res, next);
  }

  async getVehicleDetectionLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Vehicle Detection logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, vehicleNumber, search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string', description: 'Comma-separated NVR IDs' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string', description: 'Comma-separated channel IDs' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['vehicleNumber'] = { in: 'query', type: 'string', description: 'Partial match on vehicle number' }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Vehicle detection logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getVehicleDetectionLogs(req, res, next);
  }

  async getVehicleNumbers(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get the full distinct list of vehicle numbers captured in vehicleDetection incidents for the authenticated user.'
    #swagger.responses[200] = { description: 'Vehicle numbers fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getVehicleNumbers(req, res, next);
  }

  async getConveyorDetectionLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Conveyor Detection logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, status (ON|OFF), search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['ON','OFF'] }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Conveyor detection logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getConveyorDetectionLogs(req, res, next);
  }

  async getCrusherDetectionLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Crusher Detection logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, status (ON|OFF), search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['ON','OFF'] }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Crusher detection logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getCrusherDetectionLogs(req, res, next);
  }

  async getWaterSpillageDetectionLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Water Spillage Detection logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, status (DETECTED|CLEAR), search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['DETECTED','CLEAR'] }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Water spillage detection logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getWaterSpillageDetectionLogs(req, res, next);
  }

  async getVehicleCountLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Vehicle Count (countVehicles) logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, minCount, maxCount, search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['minCount'] = { in: 'query', type: 'integer' }
    #swagger.parameters['maxCount'] = { in: 'query', type: 'integer' }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Vehicle count logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getVehicleCountLogs(req, res, next);
  }

    async getPersonCountLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Person Count (countPersons) logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, minCount, maxCount, search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['minCount'] = { in: 'query', type: 'integer' }
    #swagger.parameters['maxCount'] = { in: 'query', type: 'integer' }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Person count logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getPersonCountLogs(req, res, next);
  }

  async getLineCrossingLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Line Crossing logs (tabular). Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, minAtoB, maxAtoB, minBtoA, maxBtoA, search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['minAtoB'] = { in: 'query', type: 'integer' }
    #swagger.parameters['maxAtoB'] = { in: 'query', type: 'integer' }
    #swagger.parameters['minBtoA'] = { in: 'query', type: 'integer' }
    #swagger.parameters['maxBtoA'] = { in: 'query', type: 'integer' }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Line crossing logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getLineCrossingLogs(req, res, next);
  }

  async getDeskAbsenceLogs(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get Desk Absence (deskAbsence) time-series logs for graphing. Each record is a per-camera/per-day incident with a timeSeries array of { timestamp, personCount, zoneName } points, plus nvrData and channelData. Filters: startDate, endDate, nvrId/nvrIds, channelId/channelIds, severity, resolved, reportStatus, zoneName, search. Paginated via skip/limit.'
    #swagger.parameters['skip'] = { in: 'query', type: 'integer' }
    #swagger.parameters['limit'] = { in: 'query', type: 'integer' }
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string', description: 'Comma-separated NVR IDs' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string', description: 'Comma-separated channel IDs' }
    #swagger.parameters['severity'] = { in: 'query', type: 'string', enum: ['low','moderate','high'] }
    #swagger.parameters['resolved'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['reportStatus'] = { in: 'query', type: 'boolean' }
    #swagger.parameters['zoneName'] = { in: 'query', type: 'string', description: 'Filter records having at least one time-series point in this zone' }
    #swagger.parameters['search'] = { in: 'query', type: 'string' }
    #swagger.responses[200] = { description: 'Desk absence logs fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getDeskAbsenceLogs(req, res, next);
  }

  async getDeskAbsenceZoneNames(req, res, next) {
    /* #swagger.tags = ['Incidents']
    #swagger.description = 'Get unique zone names for desk absence logs filtering'
    #swagger.parameters['startDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['endDate'] = { in: 'query', type: 'string', description: 'YYYY-MM-DD' }
    #swagger.parameters['nvrId'] = { in: 'query', type: 'string' }
    #swagger.parameters['nvrIds'] = { in: 'query', type: 'string', description: 'Comma-separated NVR IDs' }
    #swagger.parameters['channelId'] = { in: 'query', type: 'string' }
    #swagger.parameters['channelIds'] = { in: 'query', type: 'string', description: 'Comma-separated channel IDs' }
    #swagger.responses[200] = { description: 'Zone names fetched successfully' }
    #swagger.responses[500] = { description: 'Internal server error' }
    #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return await incidentsService.getDeskAbsenceZoneNames(req, res, next);
  }
}

export default new IncidentsController();