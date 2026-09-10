import measurementsService from "./measurements.service.js";

class MeasurementsController {
  async createCapture(req, res) {
    /* #swagger.tags = ['Measurements']
       #swagger.description = 'Upload a raw JPEG capture using an approved Raspberry Pi station token.'
       #swagger.responses[201] = { description: 'Capture stored' }
       #swagger.responses[401] = { description: 'Station token invalid or unapproved' }
       #swagger.responses[413] = { description: 'Capture exceeds 15 MB' } */
    return measurementsService.createCapture(req, res);
  }

  async fetchCapture(req, res) {
    /* #swagger.tags = ['Measurements']
       #swagger.description = 'Fetch a stored measurement capture by filename.' */
    return measurementsService.fetchCapture(req, res);
  }

  async deleteCapture(req, res) {
    return measurementsService.deleteCapture(req, res);
  }
}

export default new MeasurementsController();
