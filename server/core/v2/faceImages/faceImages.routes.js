import Router from 'express';
import faceImagesController from "./faceImages.controller.js";
import verifyToken from '../../../middlewares/verifyToken.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

router.post("/upload", verifyToken, faceImagesController.uploadImages);
router.get("/grouped", verifyToken, viewAccessCheck, faceImagesController.getGroupedImages);
router.patch("/tag", verifyToken, editAccessCheck, faceImagesController.tagFolder);
router.post("/quick-create-user", verifyToken, createAccessCheck, faceImagesController.quickCreateUser);
router.delete("/delete", verifyToken, deleteAccessCheck, faceImagesController.deleteImages);

export default router;
