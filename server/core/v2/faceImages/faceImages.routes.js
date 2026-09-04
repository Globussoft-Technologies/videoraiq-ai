import Router from 'express';
import faceImagesController from "./faceImages.controller.js";
import verifyToken from '../../../middlewares/verifyToken.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';
import multer from 'multer';

// Memory storage, same as the Register User flow: buffers go straight to
// putMedia (Oracle/SFTP) rather than touching local disk.
const upload = multer();

const router = Router();

router.post("/upload", verifyToken, faceImagesController.uploadImages);
router.get("/grouped", verifyToken, viewAccessCheck, faceImagesController.getGroupedImages);
router.patch("/tag", verifyToken, editAccessCheck, faceImagesController.tagFolder);
router.post("/quick-create-user", upload.array('file', 3), verifyToken, createAccessCheck, faceImagesController.quickCreateUser);
router.delete("/delete", verifyToken, deleteAccessCheck, faceImagesController.deleteImages);

export default router;
