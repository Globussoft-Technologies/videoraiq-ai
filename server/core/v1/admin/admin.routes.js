import express from "express";
import adminController from "./admin.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
const router = express.Router();

router.post("/signUp",adminController.signUP);
router.get("/fetch",verifyToken,adminController.fetch);
router.put("/update",adminController.updateAdmin);
router.post("/get-emp-employees-by-organization",verifyToken,adminController.getEmpEmployees);
router.post("/import-emp-users",verifyToken,adminController.importEMPUsers);
router.post("/add-emp-emails",verifyToken,adminController.addEMPEmails);
router.get("/get-emp-emails",verifyToken,adminController.getEMPEmails);
router.put("/update-emp-email",verifyToken,adminController.updateEMPEmail);
router.delete("/delete-emp-email",verifyToken,adminController.deleteEMPEmail);
router.get("/get-location-by-emp-email",verifyToken,adminController.getLocationByEmpEmail)
router.get("/delete-emp-email-progress",verifyToken,adminController.getDeletionProgress);
router.get("/allowed-detections",verifyToken,adminController.getAllowedDetections);
router.put("/allowed-detections",verifyToken,adminController.updateAllowedDetections);
router.put("/update-logs-sound",verifyToken,adminController.updateLogsSound);
router.get("/fetch-logs-sound",verifyToken,adminController.fetchLogsSound);

export default router;
