import raspberryPiService from "./raspberryPi.service.js";

class RaspberryPiController {
  async register(req, res, next) {
    /* #swagger.tags = ['Raspberry Pi']
       #swagger.description = 'Register a Raspberry Pi and return its lifetime admin token.'
       #swagger.parameters['x-raspberry-pi-data'] = {
         in: 'header', required: true, type: 'string',
         description: 'Encrypted Raspberry Pi identifier'
       }
       #swagger.responses[201] = { description: 'Raspberry Pi registered' }
       #swagger.responses[200] = { description: 'Existing Raspberry Pi token returned' }
       #swagger.responses[400] = { description: 'Missing or invalid device header' }
       #swagger.responses[404] = { description: 'Admin not found' } */
    return await raspberryPiService.register(req, res, next);
  }

  async heartbeat(req, res, next) {
    /* #swagger.tags = ['Raspberry Pi']
       #swagger.description = 'Update Raspberry Pi connectivity status.'
       #swagger.parameters['x-raspberry-pi-data'] = {
         in: 'header', required: true, type: 'string',
         description: 'Encrypted Raspberry Pi identifier'
       }
       #swagger.responses[200] = { description: 'Heartbeat accepted' }
       #swagger.responses[404] = { description: 'Raspberry Pi is not registered' } */
    return await raspberryPiService.heartbeat(req, res, next);
  }
}

export default new RaspberryPiController();
