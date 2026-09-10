import measurementIncidentsService from "./measurementIncidents.service.js";

class MeasurementIncidentsController {
  async createFromQr(req, res) {
    return measurementIncidentsService.createFromQr(req, res);
  }

  async process(req, res) {
    /* #swagger.tags = ['Measurement Incidents']
       #swagger.description = 'Validate a measurement request, process it through DS, store QR metadata and measured data, then emit the measurement socket event.'
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return measurementIncidentsService.process(req, res);
  }

  async updateStatus(req, res) {
    /* #swagger.tags = ['Measurement Incidents']
       #swagger.description = 'Accept or reject a measurement incident.'
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return measurementIncidentsService.updateStatus(req, res);
  }

  async updateMeasurement(req, res) {
    return measurementIncidentsService.updateMeasurement(req, res);
  }

  async updateMeasurementBySku(req, res) {
    return measurementIncidentsService.updateMeasurementBySku(req, res);
  }

  async findOne(req, res) {
    return measurementIncidentsService.findOne(req, res);
  }

  async list(req, res) {
    return measurementIncidentsService.list(req, res);
  }

  async findLatestBySku(req, res) {
    return measurementIncidentsService.findLatestBySku(req, res);
  }

  async reset(req, res) {
    /* #swagger.tags = ['Measurement Incidents']
       #swagger.description = 'Reset a measurement by deleting its document.'
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return measurementIncidentsService.reset(req, res);
  }
}

export default new MeasurementIncidentsController();
