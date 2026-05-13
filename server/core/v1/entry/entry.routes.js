import express from "express";
const router = express.Router();
import entryController from "./entry.controller.js";
import { viewAccessCheck } from "../../../middlewares/permissionMiddleware.js";

router.post("/register", entryController.register);
router.post("/log", entryController.log);
router.get("/get", viewAccessCheck, entryController.get);
router.get("/users", viewAccessCheck, entryController.getUsers);
router.get("/user/:userId", viewAccessCheck, entryController.getUserEntries);

export default router;
