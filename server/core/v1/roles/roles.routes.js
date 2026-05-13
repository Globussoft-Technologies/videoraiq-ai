import express from "express";
import RolesController from "./roles.controller.js";
import verifyToken from "../../../middlewares/verifyToken.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';



const router = express.Router();

router.post("/create",verifyToken,createAccessCheck, RolesController.createRoles);
router.post("/get",verifyToken,viewAccessCheck, RolesController.get);
router.put("/update",verifyToken,editAccessCheck, RolesController.update);
router.delete("/delete",verifyToken,deleteAccessCheck, RolesController.delete);


export default router;

