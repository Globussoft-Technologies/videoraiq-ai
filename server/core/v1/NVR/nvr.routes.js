import express from "express";
import NVRController from "./nvr.controller.js";
import {
  viewAccessCheck,
  editAccessCheck,
  createAccessCheck,
  deleteAccessCheck,
} from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();

router.get("/locations", viewAccessCheck, NVRController.getNVRLocations);
router.get("/", viewAccessCheck, NVRController.getAllNvrs);
router.get("/all-nvrs", viewAccessCheck, NVRController.allNvrs);
router.post("/register", createAccessCheck, NVRController.registerNvr);
router.post("/add-nvr", createAccessCheck, NVRController.addNvr);
router.get(
  "/with-channels",
  viewAccessCheck,
  NVRController.getNVRsWithChannels
);
router.patch("/refetch/:id", editAccessCheck, NVRController.updateNvrChannels);
router.get("/delete-all", deleteAccessCheck, NVRController.deleteAllNvrs);
router.patch("/:id", editAccessCheck, NVRController.updateNvr);
router.delete("/:id", deleteAccessCheck, NVRController.deleteNvr);
router.get("/:id", viewAccessCheck, NVRController.getNvrById);

export default router;
