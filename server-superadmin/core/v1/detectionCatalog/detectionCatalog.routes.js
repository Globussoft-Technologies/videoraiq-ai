import Router from "express";
const router = Router();
import detectionCatalogController from "./detectionCatalog.controller.js";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";

router.get("/", verifySuperAdmin, detectionCatalogController.list);

export default router;
