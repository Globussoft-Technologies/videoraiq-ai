import Router from "express";
import shiftController from "./shifts.controller.js";
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

// Literal segments have to be declared before `/:id`, or Express hands
// "list" and "assignments" to the id route.
router.get("/list", viewAccessCheck, shiftController.getShiftList);

// Read-only: what a filter set would hit. Drives the live count in Bulk Assign.
router.post(
  "/assignments/preview",
  viewAccessCheck,
  shiftController.previewAssignment,
);
router.patch(
  "/assignments/unassign",
  editAccessCheck,
  shiftController.unassignShift,
);

router.get("/:id/employees", viewAccessCheck, shiftController.getShiftEmployees);
// Individual and bulk assignment are the same endpoint — `employeeIds` for one
// or a handful, `locations`/`departmentIds` for a whole group.
router.post("/:id/assign", editAccessCheck, shiftController.assignShift);

router
  .route("/:id")
  .get(viewAccessCheck, shiftController.getShiftById)
  .put(editAccessCheck, shiftController.updateShift)
  .delete(deleteAccessCheck, shiftController.deleteShift);

export default router;
