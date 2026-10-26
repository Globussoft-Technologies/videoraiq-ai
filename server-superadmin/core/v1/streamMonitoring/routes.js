import { Router } from "express";
import mongoose from "mongoose";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";
import { listCameras, cameraDetails, setCameraPolicy } from "./service.js";
import { getTelegramSettings, selectTelegramChannel, unlinkTelegramChannel } from "./telegramController.js";
import { getMonitoringControl, setMonitoringControl } from "./control.js";
import { monitoringInventoryRoutes } from "./inventory.js";

const router = Router();
router.use("/internal", monitoringInventoryRoutes(() => mongoose.connection.db));
router.get("/control", verifySuperAdmin, getMonitoringControl);
router.put("/control", verifySuperAdmin, setMonitoringControl);
router.get("/admins/:adminId/cameras", verifySuperAdmin, listCameras);
router.get("/admins/:adminId/cameras/:cameraId/details", verifySuperAdmin, cameraDetails);
router.put("/admins/:adminId/cameras/:cameraId/policy", verifySuperAdmin, setCameraPolicy);
router.get("/telegram/link-code", verifySuperAdmin, getTelegramSettings);
router.put("/telegram/selected-channel", verifySuperAdmin, selectTelegramChannel);
router.post("/telegram/unlink", verifySuperAdmin, unlinkTelegramChannel);
export default router;
