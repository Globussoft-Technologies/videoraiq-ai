import attendanceService from "./attendance.service.js";
class AttendanceController {
  async logAttendance(req, res, next) {
    /* #swagger.tags = ['Attendance']
       #swagger.description = 'Log attendance for a user.'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Attendance details',
           required: true,
           schema: { $ref: "#/definitions/logAttendance" }
       }
       #swagger.responses[201] = {
           description: 'Attendance logged'
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
    return attendanceService.logAttendance(req, res, next);
  }
  async getAttendance(req, res, next) {
    /* #swagger.tags = ['Attendance']
        #swagger.description = 'Get attendance logs'
        #swagger.parameters['skip'] = {
            in: 'query',
            description: 'Number of logs to skip',
            required: false,
            type: 'integer',
            example: 0
          }
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Number of logs to return',
            required: false,
            type: 'integer',
            example: 10
        }
        #swagger.parameters['name'] = {
            in: 'query',
            description: 'Partial or full name of the log to search',
            required: false,
            type: 'string',
            example: 'User 1'
        }
        #swagger.parameters['channelId'] = {
            in: 'query',
            description: 'Id of the channel',
            required: false,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }
        #swagger.parameters['departmentIds'] = {
            in: 'query',
            description: 'Id of the department',
            required: false,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }
        #swagger.parameters['nvrId'] = {
            in: 'query',
            description: 'Id of the nvr',
            required: false,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }
        #swagger.parameters['startDate'] = {
            in: 'query',
            description: 'Filter logs by date (ISO format)',
            required: false,
            type: 'string',
            example: '2025-10-03'
        }
        #swagger.parameters['endDate'] = {
            in: 'query',
            description: 'Filter logs by date (ISO format)',
            required: false,
            type: 'string',
            example: '2025-10-03'
        }
        #swagger.parameters['fromTime'] = {
            in: 'query',
            description: 'Filter logs by time (HH:mm format)',
            required: false,
            type: 'string',
            example: '09:00'
        }
        #swagger.parameters['toTime'] = {
            in: 'query',
            description: 'Filter logs by time (HH:mm format)',
            required: false,
            type: 'string',
            example: '18:00'
        }
        #swagger.parameters['timeType'] = {
            in: 'query',
            description: 'Type of time to filter by',
            required: false,
            type: 'string',
            enum: ['checkin', 'checkout'],
            example: 'checkin'
        }
        #swagger.parameters['sortField'] = {
            in: 'query',
            description: 'Field to sort',
            required: false,
            type: 'string',
            enum: ['fullname', 'department', 'date', 'checkin', 'checkout'],
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
        #swagger.parameters['export'] = {
            in: 'query',
            description: 'Filter logs by late status',
            required: false,
            type: 'boolean',
            example: true
        }
        #swagger.parameters['data'] = {
        in: 'body',
        description: 'Filter and pagination options',
        required: true,
        schema: { $ref: "#/definitions/getAttendance" }
        }
        #swagger.responses[200] = {
            description: 'Logs retrieved successfully'
        }
        #swagger.responses[500] = {
            description: 'Internal server error'
        }
        #swagger.security = [{
            "EncryptedAuthToken": []
        }]
    */
    return attendanceService.getAttendance(req, res, next);
  }
  async exportAttendance(req, res, next) {
    /* #swagger.tags = ['Attendance']
        #swagger.description = 'Export attendance logs'
        #swagger.parameters['name'] = {
            in: 'query',
            description: 'Partial or full name of the log to search',
            required: false,
            type: 'string',
            example: 'User 1'
        }
        #swagger.parameters['channelId'] = {
            in: 'query',
            description: 'Id of the channel',
            required: false,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }
        #swagger.parameters['departmentIds'] = {
            in: 'query',
            description: 'Id of the department',
            required: false,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }
        #swagger.parameters['nvrId'] = {
            in: 'query',
            description: 'Id of the nvr',
            required: false,
            type: 'string',
            example: '6881d0279df7d83a343bfa72'
        }
        #swagger.parameters['startDate'] = {
            in: 'query',
            description: 'Filter logs by date (ISO format)',
            required: false,
            type: 'string',
            example: '2025-10-03'
        }
        #swagger.parameters['endDate'] = {
            in: 'query',
            description: 'Filter logs by date (ISO format)',
            required: false,
            type: 'string',
            example: '2025-10-03'
        }
        #swagger.parameters['fromTime'] = {
            in: 'query',
            description: 'Filter logs by time (HH:mm format)',
            required: false,
            type: 'string',
            example: '09:00'
        }
        #swagger.parameters['toTime'] = {
            in: 'query',
            description: 'Filter logs by time (HH:mm format)',
            required: false,
            type: 'string',
            example: '18:00'
        }
        #swagger.parameters['timeType'] = {
            in: 'query',
            description: 'Type of time to filter by',
            required: false,
            type: 'string',
            enum: ['checkin', 'checkout'],
            example: 'checkin'
        }
        #swagger.parameters['sortField'] = {
            in: 'query',
            description: 'Field to sort',
            required: false,
            type: 'string',
            enum: ['fullname', 'department', 'date', 'checkin', 'checkout'],
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
        #swagger.responses[200] = {
            description: 'Logs exported successfully'
        }
        #swagger.responses[500] = {
            description: 'Internal server error'
        }
        #swagger.security = [{
            "EncryptedAuthToken": []
        }]
    */
    return attendanceService.exportAttendance(req, res, next);
  }

  async getUserLogs(req, res, next) {
    /* #swagger.tags = ['Attendance']
        #swagger.description = 'Get specific user logs (check-ins and check-outs)'
        #swagger.parameters['data'] = {
        in: 'body',
        description: 'Filter and pagination options',
        required: true,
        schema: { $ref: "#/definitions/getUserLogs" }
        }
        #swagger.responses[200] = {
            description: 'Logs retrieved successfully'
        }
        #swagger.responses[500] = {
            description: 'Internal server error'
        }
    */
    return attendanceService.getUserLogs(req, res, next);
  }
}

export default new AttendanceController();
