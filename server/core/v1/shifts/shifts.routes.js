import { cacheReads } from "../../../services/apiCache.service.js";
import Router from "express";
import shiftController from "./shifts.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import {
  viewAccessCheck,
  createAccessCheck,
  editAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";

const router = Router();

router
  .route("/")
  .get(viewAccessCheck, cacheReads.shifts, shiftController.getAllShifts)
  .post(createAccessCheck, shiftController.createShift);
router.get("/list", viewAccessCheck, cacheReads.shifts, shiftController.getShiftList);
router
  .route("/:id")
  .get(viewAccessCheck, cacheReads.shifts, shiftController.getShiftById)
  .put(editAccessCheck, shiftController.updateShift)
  .delete(deleteAccessCheck, shiftController.deleteShift);

export default router;
