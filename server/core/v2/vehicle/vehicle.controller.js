import VehicleService from "./vehicle.service.js";

class VehicleController {
  async log(req, res) {
    /* #swagger.tags = ['Vehicle Logs']
       #swagger.description = 'Log a vehicle entry.'
       #swagger.parameters['obj'] = {
           in: 'body',
           description: 'Vehicle log details',
           required: true,
           schema: { $ref: "#/definitions/VehicleLog" }
       }
       #swagger.responses[201] = {
           description: 'Vehicle entry logged successfully'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return VehicleService.log(req, res);
  }

  async getVehicles(req, res) {
    /* #swagger.tags = ['Vehicle Logs']
       #swagger.description = 'Get all vehicles with search.'
       #swagger.parameters['search'] = {
           in: 'query',
           description: 'Search by vehicle number',
           required: false,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Vehicles retrieved successfully'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return VehicleService.getVehicles(req, res);
  }

  async getVehicleEntries(req, res) {
    /* #swagger.tags = ['Vehicle Logs']
       #swagger.description = 'Get entry logs for a specific vehicle.'
       #swagger.parameters['vehicleId'] = {
           in: 'path',
           description: 'Id of the vehicle',
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
           description: 'Vehicle entries retrieved successfully'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return VehicleService.getVehicleEntries(req, res);
  }
}

export default new VehicleController();
