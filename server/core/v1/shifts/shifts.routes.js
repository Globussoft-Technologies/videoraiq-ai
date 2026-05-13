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
  .get(viewAccessCheck, shiftController.getAllShifts)
  .post(createAccessCheck, shiftController.createShift);
router.get("/list", viewAccessCheck, shiftController.getShiftList);
router
  .route("/:id")
  .get(viewAccessCheck, shiftController.getShiftById)
  .put(editAccessCheck, shiftController.updateShift)
  .delete(deleteAccessCheck, shiftController.deleteShift);

export default router;
