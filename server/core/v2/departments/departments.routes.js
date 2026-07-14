import express from "express";
const router = express.Router();
import verifyToken from "../../../middlewares/verifyToken.js";
import departmentsController from "./departments.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


router.post("/create",verifyToken,createAccessCheck,departmentsController.create);
router.post("/get",verifyToken,viewAccessCheck,departmentsController.get);
router.put("/update",verifyToken,editAccessCheck,departmentsController.update);
router.delete("/delete",verifyToken,deleteAccessCheck,departmentsController.delete);


export default router;
