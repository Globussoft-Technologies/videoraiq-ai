import Router from "express";
const router = Router();
import detectionCatalogController from "./detectionCatalog.controller.js";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";

router.get("/", verifySuperAdmin, detectionCatalogController.list);
// Refresh button — re-reads the catalog the client backend publishes.
router.post("/sync", verifySuperAdmin, detectionCatalogController.sync);

export default router;
