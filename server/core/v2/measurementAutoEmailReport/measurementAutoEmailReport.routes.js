import express from "express";
import controller from "./measurementAutoEmailReport.controller.js";
import {
  viewAccessCheck,
  editAccessCheck,
  createAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();

/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.get("/", viewAccessCheck, controller.list);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.post("/", createAccessCheck, controller.create);
/* #swagger.tags = ['Measurement Auto Email Reports']
   #swagger.description = 'Verified recipient emails + known stations for the schedule form.' */
router.get("/form-options", viewAccessCheck, controller.formOptions);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.get("/:id", viewAccessCheck, controller.getById);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.put("/:id", editAccessCheck, controller.update);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.delete("/:id", deleteAccessCheck, controller.remove);
/* #swagger.tags = ['Measurement Auto Email Reports'] */
router.post("/:id/send-now", editAccessCheck, controller.sendNow);

export default router;
