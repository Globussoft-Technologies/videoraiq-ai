import express from "express";
import ObjectsController from "./objects.controller.js";
import {
  viewAccessCheck,
  editAccessCheck,
  createAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();
router
  .route("/")
  .get(viewAccessCheck, ObjectsController.getAllObjects)
  .post(createAccessCheck, ObjectsController.createDetectionObjects);
router.post("/delete", deleteAccessCheck, ObjectsController.deleteDetectionObjects);


export default router;
