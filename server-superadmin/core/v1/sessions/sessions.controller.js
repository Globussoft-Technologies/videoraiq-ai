import sessionsService from "./sessions.service.js";

class SessionsController {
  async getUserSessions(req, res, next) {
    return sessionsService.getUserSessions(req, res, next);
  }

  async getAdminSessions(req, res, next) {
    return sessionsService.getAdminSessions(req, res, next);
  }

  async getSessionDetails(req, res, next) {
    return sessionsService.getSessionDetails(req, res, next);
  }

  async logoutSession(req, res, next) {
    return sessionsService.logoutSession(req, res, next);
  }

  async deleteSession(req, res, next) {
    return sessionsService.deleteSession(req, res, next);
  }

  async bulkDeleteSessions(req, res, next) {
    return sessionsService.bulkDeleteSessions(req, res, next);
  }

  async blockSession(req, res, next) {
    return sessionsService.blockSession(req, res, next);
  }

  async unblockSession(req, res, next) {
    return sessionsService.unblockSession(req, res, next);
  }

  async blockDevice(req, res, next) {
    return sessionsService.blockDevice(req, res, next);
  }

  async getBlockedDevices(req, res, next) {
    return sessionsService.getBlockedDevices(req, res, next);
  }

  async getSessionSummary(req, res, next) {
    return sessionsService.getSessionSummary(req, res, next);
  }

  async unblockDevice(req, res, next) {
    return sessionsService.unblockDevice(req, res, next);
  }
}

export default new SessionsController();
