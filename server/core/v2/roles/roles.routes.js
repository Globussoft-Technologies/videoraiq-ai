import express from "express";
import RolesController from "./roles.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';



const router = express.Router();

router.post("/create",verifyToken,createAccessCheck, RolesController.createRoles);
router.post("/get",verifyToken,viewAccessCheck, RolesController.get);
router.put("/update",verifyToken,editAccessCheck, RolesController.update);
// Maintenance action, not a per-role edit: rewrites the three default roles
// from permissions.config.js. Gated on roles.edit here and additionally on
// permission.edit inside the service, since it rewrites permission documents.
router.post("/sync-defaults",verifyToken,editAccessCheck, RolesController.syncDefaultRoles);
router.delete("/delete",verifyToken,deleteAccessCheck, RolesController.delete);


export default router;

