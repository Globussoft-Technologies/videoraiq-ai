import accesslogsService from "./accesslogs.service.js";
class AccessLogsController{
    async createAccessLog(req,res,next){
        /* #swagger.tags = ['AccessLogs']
        #swagger.description = 'Update specific fields of a camera channel'
        #swagger.parameters['data'] = {
            in: 'body',
            description: 'Fields to update',
            required: true,
            schema: { $ref: "#/definitions/createAccessLogRecord" }
        }*/
    return await accesslogsService.createAccessLog(req, res, next);

    }

    async getAccessLogs(req,res,next){
    /* #swagger.tags = ['AccessLogs']
    #swagger.description = 'Get access logs'
    #swagger.parameters['sortField'] = {
            in: 'query',
            description: 'Field to sort',
            required: false,
            type: 'string',
            enum: ['userInfo.userName', 'department.departmentName', 'date'],
            example: 'fullname'
    }
        #swagger.parameters['sortOrder'] = {
            in: 'query',
            description: 'sort order: asc or desc',
            required: false,
            type: 'string',
            enum: ['asc', 'desc'],
            example: 'asc'
        }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Filter and pagination options',
        required: true,
        schema: { $ref: "#/definitions/getAccessLogs" }
    }*/
    return await accesslogsService.getAccessLogs(req, res, next);

    }

    async createAccessLogRecord(req,res,next){
        /* #swagger.tags = ['AccessLogs']
        #swagger.description = 'Update specific fields of a camera channel'
        #swagger.parameters['data'] = {
            in: 'body',
            description: 'Fields to update',
            required: true,
            schema: { $ref: "#/definitions/createAccessLogRecord" }
        }*/
        return await accesslogsService.createAccessLogRecord(req, res, next);
    }
    async getLogs(req,res,next){
    /* #swagger.tags = ['AccessLogs']
    #swagger.description = 'Get access logs'
    #swagger.parameters['sortField'] = {
            in: 'query',
            description: 'Field to sort',
            required: false,
            type: 'string',
            enum: ['userInfo.userName', 'department.departmentName', 'date'],
            example: 'fullname'
    }
        #swagger.parameters['sortOrder'] = {
            in: 'query',
            description: 'sort order: asc or desc',
            required: false,
            type: 'string',
            enum: ['asc', 'desc'],
            example: 'asc'
        }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Filter and pagination options',
        required: true,
        schema: { $ref: "#/definitions/getAccessLogs" }
    }*/
    return await accesslogsService.getLogs(req, res, next);

    }

    async getUserSessionReport(req,res,next){
    /* #swagger.tags = ['AccessLogs']
    #swagger.description = 'Get user session report'
    #swagger.parameters['sortField'] = {
            in: 'query',
            description: 'Field to sort',
            required: false,
            type: 'string',
            enum: ['userInfo.userName', 'department.departmentName', 'date'],
            example: 'fullname'
    }
        #swagger.parameters['sortOrder'] = {
            in: 'query',
            description: 'sort order: asc or desc',
            required: false,
            type: 'string',
            enum: ['asc', 'desc'],
            example: 'asc'
        }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Filter and pagination options',
        required: true,
        schema: { $ref: "#/definitions/getUserSessionReport" }
    }*/
    return await accesslogsService.getUserSessionReport(req, res, next);

    }
}
export default new AccessLogsController();