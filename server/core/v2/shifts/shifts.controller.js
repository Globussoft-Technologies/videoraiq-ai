import shiftService from "./shifts.service.js";

class ShiftController {
    async createShift(req, res, next) {
      /* #swagger.tags = ['Shifts']
       #swagger.description = 'Add a new shift'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Shift details',
           required: true,
           schema: { $ref: "#/definitions/addShift" }
       }
       #swagger.responses[201] = {
           description: 'Shift added successfully'
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
      return shiftService.createShift(req, res, next);
    }
    async getAllShifts(req, res, next) {
      /* #swagger.tags = ['Shifts']
       #swagger.description = 'Get all shifts'
       #swagger.parameters['skip'] = {
            in: 'query',
            description: 'Number of shifts to skip',
            required: false,
            type: 'integer',
            example: 0
          }
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Number of shifts to return',
            required: false,
            type: 'integer',
            example: 10
        }
        #swagger.parameters['name'] = {
            in: 'query',
            description: 'Partial or full name of the shift to search',
            required: false,
            type: 'string',
            example: 'User 1'
        }
       #swagger.responses[200] = {
           description: 'Shifts retrieved successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
      return shiftService.getAllShifts(req, res, next);
    }
    async getShiftById(req, res, next) {
      /* #swagger.tags = ['Shifts']
       #swagger.description = 'Get shift by ID'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'Shift ID',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Shift details retrieved successfully'
       }
       #swagger.responses[404] = {
           description: 'Shift not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
      return shiftService.getShiftById(req, res, next);
    }
    async updateShift(req, res, next) {
      /* #swagger.tags = ['Shifts']
       #swagger.description = 'Update shift by ID'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'Shift ID',
           required: true,
           type: 'string'
       }
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Updated shift details',
           required: true,
           schema: { $ref: "#/definitions/addShift" }
       }
       #swagger.responses[200] = {
           description: 'Shift updated successfully'
       }
       #swagger.responses[404] = {
           description: 'Shift not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
      return shiftService.updateShift(req, res, next);
    }
    async deleteShift(req, res, next) {
      /* #swagger.tags = ['Shifts']
       #swagger.description = 'Delete shift by ID'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'Shift ID',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Shift deleted successfully'
       }
       #swagger.responses[404] = {
           description: 'Shift not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
      return shiftService.deleteShift(req, res, next);
    }
    async getShiftList(req, res, next) {
      /* #swagger.tags = ['Shifts']
       #swagger.description = 'Get list of shifts for dropdown'
       #swagger.responses[200] = {
           description: 'Shift list retrieved successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
      return shiftService.getShiftList(req, res, next);
    }
}

export default new ShiftController();