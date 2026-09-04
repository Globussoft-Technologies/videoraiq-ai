import shiftScheduleService from "./shiftSchedule.service.js";

class ShiftScheduleController {
  async getSchedule(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Monthly shift schedule grid: a page of employees, every day of the month, and the resolved shift for each cell'
       #swagger.parameters['month'] = { in: 'query', required: true, type: 'string', example: '2026-09' }
       #swagger.parameters['search'] = { in: 'query', description: 'Name, employee code or email', required: false, type: 'string' }
       #swagger.parameters['skip'] = { in: 'query', required: false, type: 'integer', example: 0 }
       #swagger.parameters['limit'] = { in: 'query', required: false, type: 'integer', example: 10 }
       #swagger.responses[200] = { description: 'Schedule retrieved successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftScheduleService.getSchedule(req, res, next);
  }

  async assignDay(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Assign, change or mark off one employee on one date'
       #swagger.parameters['data'] = {
           in: 'body',
           required: true,
           schema: { $ref: "#/definitions/shiftScheduleAssign" }
       }
       #swagger.responses[200] = { description: 'Schedule updated successfully' }
       #swagger.responses[404] = { description: 'Employee or shift not found' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftScheduleService.assignDay(req, res, next);
  }

  async bulkAssign(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Assign a shift across a date range for many employees, optionally narrowed to certain weekdays'
       #swagger.parameters['data'] = {
           in: 'body',
           required: true,
           schema: { $ref: "#/definitions/shiftScheduleBulkAssign" }
       }
       #swagger.responses[200] = { description: 'Schedule updated successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftScheduleService.bulkAssign(req, res, next);
  }

  async clearDays(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Remove per-day overrides so those days inherit the employee standing shift again'
       #swagger.parameters['data'] = {
           in: 'body',
           required: true,
           schema: { employeeIds: ["6512f1c0a1b2c3d4e5f60718"], from: '2026-09-01', to: '2026-09-30' }
       }
       #swagger.responses[200] = { description: 'Schedule cleared successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftScheduleService.clearDays(req, res, next);
  }

  async getDesignations(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Distinct employee designations, backing the schedule Role filter'
       #swagger.responses[200] = { description: 'Designations retrieved successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftScheduleService.getDesignations(req, res, next);
  }
}

export default new ShiftScheduleController();
