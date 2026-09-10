import service from "./measurementAutoEmailReport.service.js";

class MeasurementAutoEmailReportController {
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'Create a scheduled Mattress Measurement Logs report (PDF / XLSX / CSV attachments).' */
  create(req, res) { return service.create(req, res); }
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'List saved measurement report schedules; search by title or recipient.' */
  list(req, res) { return service.list(req, res); }
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'Verified recipient emails and known QC stations for the schedule form.' */
  formOptions(req, res) { return service.formOptions(req, res); }
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'Load one saved schedule for the edit dialog.' */
  getById(req, res) { return service.getById(req, res); }
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'Update a saved schedule, including cadence, recipients, formats or enabled state.' */
  update(req, res) { return service.update(req, res); }
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'Delete a saved measurement report schedule.' */
  remove(req, res) { return service.remove(req, res); }
  /* #swagger.tags = ['Measurement Auto Email Reports']
     #swagger.description = 'Send the report immediately; optional body.recipients sends a test to just those addresses.' */
  sendNow(req, res) { return service.sendNow(req, res); }
}

export default new MeasurementAutoEmailReportController();
