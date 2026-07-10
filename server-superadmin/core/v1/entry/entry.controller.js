import EntryService from "./entry.service.js";
class EntryController {
  async register(req, res) {
    /* #swagger.tags = ['Entry Logs']
       #swagger.description = 'Log entry for a user.'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Entry details',
           required: true,
           schema: { $ref: "#/definitions/RegisterEntryUser" }
       }
       #swagger.responses[201] = {
           description: 'User registered successfully'
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
    return EntryService.register(req, res);
  }

  async log(req, res) {
    /* #swagger.tags = ['Entry Logs']
       #swagger.description = 'Log entry for a user.'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Entry details',
           required: true,
           schema: { $ref: "#/definitions/LogEntry" }
       }
       #swagger.responses[201] = {
           description: 'Entry logged'
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
    return EntryService.log(req, res);
  }
  async get(req, res) {
    /* #swagger.tags = ['Entry Logs']
       #swagger.description = 'Get entry logs for a user.'
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
           description: 'Entry logs retrieved successfully'
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
    return EntryService.get(req, res);
  }
  async getUsers(req, res) {
    /* #swagger.tags = ['Entry Logs']
       #swagger.description = 'Get all entry users with search.'
       #swagger.parameters['search'] = {
           in: 'query',
           description: 'Search by name or email',
           required: false,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Users retrieved successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return EntryService.getUsers(req, res);
  }

  async getUserEntries(req, res) {
    /* #swagger.tags = ['Entry Logs']
       #swagger.description = 'Get entry logs for a specific user.'
       #swagger.parameters['userId'] = {
           in: 'path',
           description: 'Id of the user',
           required: true,
           type: 'string'
       }
       #swagger.parameters['startDate'] = {
           in: 'query',
           description: 'Filter logs by date (ISO format)',
           required: false,
           type: 'string'
       }
       #swagger.parameters['endDate'] = {
           in: 'query',
           description: 'Filter logs by date (ISO format)',
           required: false,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'User entries retrieved successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return EntryService.getUserEntries(req, res);
  }
}

export default new EntryController();
