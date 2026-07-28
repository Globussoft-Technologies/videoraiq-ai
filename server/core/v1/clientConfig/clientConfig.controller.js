import clientConfigService from "./clientConfig.service.js";

class ClientConfigController {
  async getAccount(req, res, next) {
    /* #swagger.tags = ['Client Config'] */
    /* #swagger.description = "The calling client's own account row: name, email, plan, camera count, subscription expiry and status. The superadmin equivalent lists every client on the platform; this returns only the caller. The client is taken from the access token." */
    return await clientConfigService.getAccount(req, res, next);
  }

  async getConfig(req, res, next) {
    /* #swagger.tags = ['Client Config'] */
    /* #swagger.description = "The calling client's own configuration: camera stat cards (purchased / configured / non-configured / detections enabled) and the per-detection allocation table. Read-only — allocations are set by the superadmin. The client is taken from the access token; there is no adminId parameter." */
    return await clientConfigService.getConfig(req, res, next);
  }

  async getCameras(req, res, next) {
    /* #swagger.tags = ['Client Config'] */
    /* #swagger.description = "The calling client's cameras with the detections allocated to them and each detection's on/off state per camera. Read-only. The client is taken from the access token." */
    /* #swagger.parameters['search'] = { in: 'query', description: 'Filter by camera name / customName' } */
    return await clientConfigService.getCameras(req, res, next);
  }
}

export default new ClientConfigController();
