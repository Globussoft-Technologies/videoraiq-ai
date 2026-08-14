import service from "./attendanceAutoEmailReport.service.js";

class AttendanceAutoEmailReportController {
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Create a scheduled attendance report with branded PDF and/or CSV attachments.'
     #swagger.parameters['data'] = { in: 'body', required: true, schema: { title: 'Weekly attendance', recipients: ['hr@example.com'], schedule: { frequency: 'weekly', time: '00:00', weekday: 1 }, target: { scope: 'organization' }, formats: ['pdf', 'csv'], enabled: true } } */
  create(req, res) { return service.create(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'List saved reports and search by title or recipient.' */
  list(req, res) { return service.list(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Get employee and department selector options for the report form.' */
  audienceOptions(req, res) { return service.audienceOptions(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Get a saved report for editing.' */
  getById(req, res) { return service.getById(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Update an attendance report or enable/disable its schedule.' */
  update(req, res) { return service.update(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Delete a saved attendance report.' */
  remove(req, res) { return service.remove(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Preview report rows without sending an email.' */
  preview(req, res) { return service.preview(req, res); }
  /* #swagger.tags = ['Attendance Auto Email Reports']
     #swagger.description = 'Send the report immediately. An optional body.recipients array sends a test only to those recipients.' */
  sendNow(req, res) { return service.sendNow(req, res); }
}

export default new AttendanceAutoEmailReportController();
