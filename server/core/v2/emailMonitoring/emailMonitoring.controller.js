import emailMonitoringService from "./emailMonitoring.service.js";

class EmailMonitoringController {
  async sendGridWebhook(req, res, next) {
    return emailMonitoringService.sendGridWebhook(req, res, next);
  }

  async organizations(req, res, next) {
    return emailMonitoringService.organizations(req, res, next);
  }

  async dashboard(req, res, next) {
    return emailMonitoringService.dashboard(req, res, next);
  }

  async activity(req, res, next) {
    return emailMonitoringService.activity(req, res, next);
  }
}

export default new EmailMonitoringController();
