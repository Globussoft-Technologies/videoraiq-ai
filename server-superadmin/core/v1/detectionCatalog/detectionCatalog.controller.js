import detectionCatalogService from "./detectionCatalog.service.js";

class DetectionCatalogController {
  async list(req, res, next) {
    /* #swagger.tags = ['Detection Catalog'] */
    /* #swagger.description = 'List every platform detection type and how many clients have opted for it (enabled allocation). Super-admin token required.' */
    return await detectionCatalogService.list(req, res, next);
  }
}

export default new DetectionCatalogController();
