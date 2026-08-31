import detectionCatalogService from "./detectionCatalog.service.js";

class DetectionCatalogController {
  async list(req, res, next) {
    /* #swagger.tags = ['Detection Catalog'] */
    /* #swagger.description = 'List every platform detection type and how many clients have opted for it (enabled allocation). Super-admin token required.' */
    return await detectionCatalogService.list(req, res, next);
  }

  async sync(req, res, next) {
    /* #swagger.tags = ['Detection Catalog'] */
    /* #swagger.description = 'Re-read the shared detection catalog that the client backend publishes from its DETECTION_TYPES constants, so a newly added detection shows up here without redeploying this service. Super-admin token required.' */
    return await detectionCatalogService.sync(req, res, next);
  }
}

export default new DetectionCatalogController();
