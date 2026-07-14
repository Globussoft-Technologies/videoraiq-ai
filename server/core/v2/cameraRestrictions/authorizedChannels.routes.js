import Router from 'express';
import verifyToken from '../../../middlewares/verifyToken.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';
import authUserController from "./authorizedChannels.controller.js"
const router = Router();



router.post("/fetchChannels",verifyToken,authUserController.fetchChannels);
router.post("/locations",verifyToken,authUserController.fetchLocations);
router.post("/departments",verifyToken,authUserController.fetchDepartments);
router.post("/getNVRS",verifyToken,authUserController.fetchNVRS);
router.post("/getChannels",verifyToken,authUserController.fetchChannelByNVRsOrDepartment);




export default router;