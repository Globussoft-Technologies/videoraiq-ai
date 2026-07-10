import express from "express";
const router = express.Router();
import vehicleController from "./vehicle.controller.js";
import { viewAccessCheck } from "../../../middlewares/permissionMiddleware.js";

router.post("/log", vehicleController.log);
router.get("/vehicles", viewAccessCheck, vehicleController.getVehicles);
router.get(
  "/vehicle/:vehicleId",
  viewAccessCheck,
  vehicleController.getVehicleEntries,
);

export default router;
