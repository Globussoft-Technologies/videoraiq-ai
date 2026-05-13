import locationService from "./location.service.js"

class LocationController {
  async createLocation(req, res, next) {
    /* 
    #swagger.tags = ['Locations']
    #swagger.description = 'Create a new location under the organization'

    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Location creation payload containing locationName and empLocationId',
      required: true,
      schema: { $ref: '#/definitions/createLocation' }
    }
    #swagger.responses[201] = {
      description: 'Location created successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return locationService.createLocation(req, res, next);
  }

  async fetchLocations(req, res, next) {
    /* 
    #swagger.tags = ['Locations']
    #swagger.description = 'Fetch all locations with pagination and search optional filters'

    #swagger.parameters['skip'] = {
      in: 'query',
      description: 'Pagination skip',
      required: false,
      type: 'integer'
    }
    #swagger.parameters['limit'] = {
      in: 'query',
      description: 'Pagination limit',
      required: false,
      type: 'integer'
    }
    #swagger.parameters['search'] = {
      in: 'query',
      description: 'Search string for locationName or empLocationId',
      required: false,
      type: 'string'
    }
    #swagger.responses[200] = {
      description: 'Locations fetched successfully'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return locationService.fetchLocations(req, res, next);
  }

  async getLocationById(req, res, next) {
    /* 
    #swagger.tags = ['Locations']
    #swagger.description = 'Fetch a specific location by ID'

    #swagger.parameters['id'] = {
      in: 'query',
      description: 'Location ID',
      required: true,
      type: 'string'
    }
    #swagger.responses[200] = {
      description: 'Location fetched successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error: missing location id'
    }
    #swagger.responses[404] = {
      description: 'Location not found'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return locationService.getLocationById(req, res, next);
  }

  async updateLocation(req, res, next) {
    /* 
    #swagger.tags = ['Locations']
    #swagger.description = 'Update a specific location by ID'

    #swagger.parameters['id'] = {
      in: 'query',
      description: 'Location ID',
      required: true,
      type: 'string'
    }
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Location update payload',
      required: true,
      schema: { $ref: '#/definitions/updateLocation' }
    }
    #swagger.responses[200] = {
      description: 'Location updated successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing location id'
    }
    #swagger.responses[404] = {
      description: 'Location not found'
    }
    #swagger.responses[409] = {
      description: 'Conflict: Another location with this employee location ID already exists'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return locationService.updateLocation(req, res, next);
  }

  async deleteLocation(req, res, next) {
    /* 
    #swagger.tags = ['Locations']
    #swagger.description = 'Delete a specific location by ID'

    #swagger.parameters['id'] = {
      in: 'query',
      description: 'Location ID',
      required: true,
      type: 'string'
    }
    #swagger.responses[200] = {
      description: 'Location deleted successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error: missing location id'
    }
    #swagger.responses[404] = {
      description: 'Location not found'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return locationService.deleteLocation(req, res, next);
  }

  async fetchEmployeeLocation(req, res, next) {
    /* 
    #swagger.tags = ['Locations']
    #swagger.description = 'Fetch all employee locations with pagination and search optional filters'

    #swagger.parameters['skip'] = {
      in: 'query',
      description: 'Pagination skip',
      required: false,
      type: 'integer'
    }
    #swagger.parameters['limit'] = {
      in: 'query',
      description: 'Pagination limit',
      required: false,
      type: 'integer'
    }
    #swagger.parameters['search'] = {
      in: 'query',
      description: 'Search string for locationName or empLocationId',
      required: false,
      type: 'string'
    }
    #swagger.responses[200] = {
      description: 'Locations fetched successfully'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return locationService.fetchEmployeeLocation(req, res, next);
  }
}

export default new LocationController();
