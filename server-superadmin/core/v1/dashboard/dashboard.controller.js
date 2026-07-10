import dashboardService from "./dashboard.service.js";
class DashboardController {
  async headerStats(req, res, next) {
    /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard header Stats.'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/dashboardHeaderStats' }
    }
    #swagger.responses[201] = {
      description: 'dashboard stats successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */

    return dashboardService.headerStats(req, res, next);
  }

  async criticalityStats(req, res, next){

        /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard criticality Stats .'
    #swagger.parameters['skip'] = {
                            in: 'query',
                            type:'string',
                            description: 'results skip',
    } 
    #swagger.parameters['limit'] = {
                            in: 'query',
                            type:'string',
                            description:'limit',
    } 
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/dashboardCriticalityStats' }
    }
    #swagger.responses[201] = {
      description: 'dashboard stats successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.criticalityStats(req, res, next);

  }

  async detectionChart(req,res,next){

            /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard detectionGraph Stats .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/detectionGraphStats' }
    }
    #swagger.responses[201] = {
      description: 'dashboard stats successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.detectionChart(req,res,next);
  }

  async WeeklyComparisonChart(req,res,next){
    
      /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard WeeklyComparisonChart Stats .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/WeeklyComparisonChart' }
    }
    #swagger.responses[201] = {
      description: 'dashboard WeeklyComparisonChart stats fetched successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.WeeklyComparisonChart(req,res,next);
  }

  async getSidebarConfig(req,res,next){
    /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard sideBar Config .'
    #swagger.responses[201] = {
      description: 'dashboard sidebarConfig fetched successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.getSidebarConfig(req,res,next);
  }
    async updateSidebarConfig(req,res,next){

    /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To update dashboard sideBar Config  .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/updateSidebarConfig' }
    }
    #swagger.responses[201] = {
      description: 'dashboard sideBar Config Updated successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.updateSidebarConfig(req,res,next);
  }
  async recentIncidents(req,res,next){
    
    /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To update dashboard sideBar Config
    #swagger.parameters['nvrId'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: '_id of nvr'
    }
    #swagger.parameters['channelId'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: '_id of channel'
    }
    #swagger.parameters['location'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Location of camera'
    }
    #swagger.parameters['department'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Department ID (ObjectId) to filter a specific channel'
  } .'
    #swagger.responses[201] = {
      description: 'dashboard sideBar Config Updated successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.recentIncidents(req,res,next);

  }

  async getIncidentsByType(req,res,next){
        /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard IncidentsGroupedByType  .'
    #swagger.parameters['incidentType'] = {
        in: 'query',
        type: 'string',
        description: 'Filter incidents by type',
        enum: ['lineCrossing',  'motionDetection', 'genericObjectDetection','loiteringWithAuth','loiteringWithoutAuth','unauthorizedAccess',]
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
    #swagger.responses[201] = {
      description: 'dashboard IncidentsGroupedByType fetched successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.getIncidentsByType(req,res,next);
  }

  async getDetections(req,res,next){
    /* 
    #swagger.tags = ['Dashboard']
    #swagger.description = 'To get dashboard Detections  .'
    #swagger.parameters['detectionType'] = {
        in: 'query',
        type: 'string',
        description: 'Filter detections by type',
        enum: ['genericObjectDetection','countPersons','countVehicles', 'lineCrossing']
    }
    #swagger.parameters['day'] = {
        in: 'query',
        type: 'string',
        required:true,
        description: 'Filter detections by date or day',
        enum: ['dateFilter','today','yesterday']
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
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: false,
      schema: { $ref: '#/definitions/getDetections' }
    }
    #swagger.responses[201] = {
      description: 'dashboard detections fetched successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return dashboardService.getDetections(req,res,next);
  }


}

export default new DashboardController();