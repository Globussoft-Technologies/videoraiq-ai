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

  async registrationStatus(req, res, next) {
    /* #swagger.tags = ['Raspberry Pi']
       #swagger.description = 'Poll a Raspberry Pi registration code for pending/approved state and its station token.'
       #swagger.responses[200] = { description: 'Registration status returned' }
       #swagger.responses[404] = { description: 'Registration code not found' } */
    return await raspberryPiService.registrationStatus(req, res, next);
  }

  async adminRegistrations(req, res, next) {
    /* #swagger.tags = ['Raspberry Pi']
       #swagger.description = 'List this administrator’s paired Raspberry Pis or securely look up one six-digit pairing code.'
       #swagger.security = [{ "EncryptedAuthToken": [] }] */
    return await raspberryPiService.adminRegistrations(req, res, next);
  }

  async updateApproval(req, res, next) {
    /* #swagger.tags = ['Raspberry Pi']
       #swagger.description = 'Approve or reject a Raspberry Pi pairing request.'
       #swagger.security = [{ "EncryptedAuthToken": [] }] */
    return await raspberryPiService.updateApproval(req, res, next);
  }

  async deleteRegistration(req, res, next) {
    /* #swagger.tags = ['Raspberry Pi']
       #swagger.description = 'Delete a Raspberry Pi connection and invalidate its station token.'
       #swagger.security = [{ "EncryptedAuthToken": [] }] */
    return await raspberryPiService.deleteRegistration(req, res, next);
  }
}

export default new RaspberryPiController();
