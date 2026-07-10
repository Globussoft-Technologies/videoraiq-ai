import Router from 'express';
import verifyToken from '../../../middlewares/verifyToken.js';
import locationController from "./location.controller.js"
import { createAccessCheck, viewAccessCheck, editAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

router.post("/create", verifyToken, createAccessCheck, locationController.createLocation);
router.post("/fetch", verifyToken, viewAccessCheck, locationController.fetchLocations);
router.post("/fetch-by-id", verifyToken, viewAccessCheck, locationController.getLocationById);
router.put("/update", verifyToken, editAccessCheck, locationController.updateLocation);
router.delete("/delete", verifyToken, deleteAccessCheck, locationController.deleteLocation);
router.post("/employee-location", verifyToken, viewAccessCheck, locationController.fetchEmployeeLocation);

export default router;
