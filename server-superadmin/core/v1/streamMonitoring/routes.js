import { Router } from "express";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";
import { listCameras } from "./service.js";
import { getTelegramSettings, selectTelegramChannel, unlinkTelegramChannel } from "./telegramController.js";

const router = Router();
router.get("/admins/:adminId/cameras", verifySuperAdmin, listCameras);
router.get("/telegram/link-code", verifySuperAdmin, getTelegramSettings);
router.put("/telegram/selected-channel", verifySuperAdmin, selectTelegramChannel);
router.post("/telegram/unlink", verifySuperAdmin, unlinkTelegramChannel);
export default router;
