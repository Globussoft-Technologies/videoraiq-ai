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
        #swagger.parameters['status'] = {
            in: 'query',
            description: 'Filter logs by attendance status',
            required: false,
            type: 'string',
            enum: ['present', 'half_day', 'absent', 'checked_in'],
            example: 'present'
        }
        #swagger.parameters['data'] = {
        in: 'body',
        description: 'Filter and pagination options',
        required: true,
        schema: { $ref: "#/definitions/getAttendance" }
        }
        #swagger.responses[200] = {
            description: 'Logs retrieved successfully. `total` and `statusCounts` cover the whole filtered range, not just the returned page — each row is graded Present / Half Day / Absent / Checked In against the org thresholds from GET /attendance/settings.',
            schema: {
              statusCode: 200,
              body: {
                status: 'success',
                message: 'Attendance summary',
                data: {
                  attendanceLogs: [],
                  total: 150,
                  totalEmployees: 180,
                  statusCounts: { present: 96, halfDay: 12, absent: 30, checkedIn: 12 },
                  attendanceLogsStartDate: '2026-01-04T04:12:00.000Z'
                }
              }
            }
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

  async getAttendanceSettings(req, res, next) {
    /* #swagger.tags = ['Attendance']
        #swagger.description = "This organisation's attendance rules: how many hours on site count as a full day and as a half day. Returns defaults (8h / 4h) when nothing has been saved yet."
        #swagger.responses[200] = {
            description: 'Attendance settings fetched successfully',
            schema: {
              statusCode: 200,
              body: {
                status: 'success',
                message: 'Attendance settings fetched successfully',
                data: { fullDayHours: 9, halfDayHours: 4 }
              }
            }
        }
        #swagger.responses[500] = { description: 'Internal server error' }
    */
    return attendanceService.getAttendanceSettings(req, res, next);
  }

  async updateAttendanceSettings(req, res, next) {
    /* #swagger.tags = ['Attendance']
        #swagger.description = 'Set this organisation\'s full-day and half-day hour thresholds. Applies to every employee under the admin. Status is derived at query time, so changing these re-grades existing attendance logs on the next read — no backfill.'
        #swagger.parameters['data'] = {
            in: 'body',
            description: 'Attendance rules',
            required: true,
            schema: { fullDayHours: 9, halfDayHours: 4 }
        }
        #swagger.responses[200] = { description: 'Attendance settings updated successfully' }
        #swagger.responses[400] = { description: 'Validation error, e.g. halfDayHours greater than fullDayHours' }
        #swagger.responses[500] = { description: 'Internal server error' }
    */
    return attendanceService.updateAttendanceSettings(req, res, next);
  }
}

export default new AttendanceController();
