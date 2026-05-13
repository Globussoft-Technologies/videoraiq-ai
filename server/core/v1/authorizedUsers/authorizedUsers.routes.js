import Router from 'express';
import authUserController from "./authorizedUsers.controller.js"
import verifyToken from '../../../middlewares/verifyToken.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';
import multer from 'multer';
const upload = multer(); // memory storage

const router = Router();

// router.post("/login",authUserController.authUserLogin);
router.post("/fetch",verifyToken,viewAccessCheck,authUserController.fetchAuthUser);
router.post("/create",upload.array('file', 3),verifyToken,createAccessCheck,authUserController.createAuthUser);
router.put("/update",upload.array('file', 3),verifyToken,editAccessCheck,authUserController.updateAuthUser);
router.delete("/delete",verifyToken,deleteAccessCheck,authUserController.deleteAuthUser);
router.delete("/delete-all", verifyToken, deleteAccessCheck, authUserController.deleteAllAuthUsers);
router.post("/bulk-import",verifyToken,createAccessCheck,authUserController.bulkImportAuthUser);
router.post("/verifyUser",verifyToken,upload.array('file', 3),authUserController.verifyUser);       
router.post("/fetch-unique-locations",verifyToken,viewAccessCheck,authUserController.fetchUniqueLocations);

export default router;