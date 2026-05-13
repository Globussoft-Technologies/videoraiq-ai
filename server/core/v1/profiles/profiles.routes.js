import express from "express";
import profilesController from "./profiles.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';

const router = express.Router();

import multer from "multer";

const upload = multer({ dest: "profieUploads/" });


router.get("/",viewAccessCheck, profilesController.getProfiles);
router.post("/",createAccessCheck, profilesController.addProfile);
router.get("/export/:id",viewAccessCheck, profilesController.exportProfile);
router.post("/bulk-export",viewAccessCheck, profilesController.bulkExportProfiles);
router.post("/bulk-delete",deleteAccessCheck, profilesController.bulkDeleteProfiles);
router.get("/export/:id",viewAccessCheck, profilesController.exportProfile);
router.post("/import",createAccessCheck, upload.single("file"), profilesController.importProfile);
router.get("/:id",viewAccessCheck, profilesController.getProfileById);
router.put("/:id",editAccessCheck, profilesController.editProfile);
router.delete("/:id",deleteAccessCheck, profilesController.deleteProfile);

export default router;
