import shiftService from "./shifts.service.js";

class ShiftController {
  async createShift(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Create a shift: window, break, grace periods, max overtime and the working-day pattern'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Shift details',
           required: true,
           schema: { $ref: "#/definitions/addShift" }
       }
       #swagger.responses[201] = { description: 'Shift created successfully' }
       #swagger.responses[400] = { description: 'Validation error or duplicate shift name' }
       #swagger.responses[500] = { description: 'Internal server error' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.createShift(req, res, next);
  }

  async getAllShifts(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Paginated shifts for the current organisation, each with its assigned-employee count'
       #swagger.parameters['skip'] = { in: 'query', required: false, type: 'integer', example: 0 }
       #swagger.parameters['limit'] = { in: 'query', required: false, type: 'integer', example: 10 }
       #swagger.parameters['name'] = { in: 'query', description: 'Case-insensitive name search', required: false, type: 'string' }
       #swagger.parameters['isActive'] = { in: 'query', description: 'Filter by active state', required: false, type: 'boolean' }
       #swagger.responses[200] = { description: 'Shifts retrieved successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.getAllShifts(req, res, next);
  }

  async getShiftById(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Get a single shift by id'
       #swagger.parameters['id'] = { in: 'path', required: true, type: 'string' }
       #swagger.responses[200] = { description: 'Shift retrieved successfully' }
       #swagger.responses[404] = { description: 'Shift not found' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.getShiftById(req, res, next);
  }

  async updateShift(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Update a shift. Any subset of fields may be sent.'
       #swagger.parameters['id'] = { in: 'path', required: true, type: 'string' }
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Fields to update',
           required: true,
           schema: { $ref: "#/definitions/addShift" }
       }
       #swagger.responses[200] = { description: 'Shift updated successfully' }
       #swagger.responses[404] = { description: 'Shift not found' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.updateShift(req, res, next);
  }

  async deleteShift(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Delete a shift. Employees holding it are unassigned first.'
       #swagger.parameters['id'] = { in: 'path', required: true, type: 'string' }
       #swagger.responses[200] = { description: 'Shift deleted successfully' }
       #swagger.responses[404] = { description: 'Shift not found' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.deleteShift(req, res, next);
  }

  async getShiftList(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Lightweight active-shift list for dropdowns'
       #swagger.responses[200] = { description: 'Shift list retrieved successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.getShiftList(req, res, next);
  }

  async previewAssignment(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Preview which employees a set of assignment filters matches. Read-only.'
       #swagger.parameters['data'] = {
           in: 'body',
           required: false,
           schema: { $ref: "#/definitions/shiftAssignmentFilters" }
       }
       #swagger.responses[200] = { description: 'Assignment preview generated' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.previewAssignment(req, res, next);
  }

  async assignShift(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Assign a shift to employees. Send employeeIds for individual assignment, or locations/departmentIds to bulk assign a group.'
       #swagger.parameters['id'] = { in: 'path', required: true, type: 'string' }
       #swagger.parameters['data'] = {
           in: 'body',
           required: true,
           schema: { $ref: "#/definitions/shiftAssignmentFilters" }
       }
       #swagger.responses[200] = { description: 'Shift assigned successfully' }
       #swagger.responses[400] = { description: 'No target selected, or the shift is inactive' }
       #swagger.responses[404] = { description: 'Shift not found' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.assignShift(req, res, next);
  }

  async unassignShift(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Clear the assigned shift on specific employees'
       #swagger.parameters['data'] = {
           in: 'body',
           required: true,
           schema: { employeeIds: ["6512f1c0a1b2c3d4e5f60718"] }
       }
       #swagger.responses[200] = { description: 'Shift unassigned successfully' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.unassignShift(req, res, next);
  }

  async getShiftEmployees(req, res, next) {
    /* #swagger.tags = ['Shifts']
       #swagger.description = 'Paginated roster of the employees currently on a shift'
       #swagger.parameters['id'] = { in: 'path', required: true, type: 'string' }
       #swagger.parameters['skip'] = { in: 'query', required: false, type: 'integer', example: 0 }
       #swagger.parameters['limit'] = { in: 'query', required: false, type: 'integer', example: 10 }
       #swagger.parameters['search'] = { in: 'query', required: false, type: 'string' }
       #swagger.responses[200] = { description: 'Shift employees retrieved successfully' }
       #swagger.responses[404] = { description: 'Shift not found' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return shiftService.getShiftEmployees(req, res, next);
  }
}

export default new ShiftController();
