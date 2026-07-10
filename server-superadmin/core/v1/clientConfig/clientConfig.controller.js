import clientConfigService from "./clientConfig.service.js";

class ClientConfigController {
  async getConfig(req, res, next) {
    /* #swagger.tags = ['Client Config'] */
    /* #swagger.description = 'Client Configuration screen: camera stat cards (total purchased / configured / non-configured / detections enabled) and the per-detection Detection Assignment table. Super-admin token required.' */
    /* #swagger.parameters['adminId'] = { in: 'path', required: true, description: 'Client admin _id' } */
    return await clientConfigService.getConfig(req, res, next);
  }

  async updatePurchasedCameras(req, res, next) {
    /* #swagger.tags = ['Client Config'] */
    /* #swagger.description = 'Set the client\'s Total Purchased Cameras. Super-admin token required.' */
    /* #swagger.parameters['adminId'] = { in: 'path', required: true, description: 'Client admin _id' } */
    /* #swagger.parameters['body'] = { in: 'body', schema: { purchasedCameras: 80 } } */
    return await clientConfigService.updatePurchasedCameras(req, res, next);
  }

  async updateDetectionAllocation(req, res, next) {
    /* #swagger.tags = ['Client Config'] */
    /* #swagger.description = 'Set a single detection\'s camera allocation and/or enabled flag for a client. Super-admin token required.' */
    /* #swagger.parameters['adminId'] = { in: 'path', required: true, description: 'Client admin _id' } */
    /* #swagger.parameters['settingType'] = { in: 'path', required: true, description: 'Detection settingType key (e.g. vehicleDetectionSettings)' } */
    /* #swagger.parameters['body'] = { in: 'body', schema: { cameraAllocation: 42, enabled: true } } */
    return await clientConfigService.updateDetectionAllocation(req, res, next);
  }
}

export default new ClientConfigController();
