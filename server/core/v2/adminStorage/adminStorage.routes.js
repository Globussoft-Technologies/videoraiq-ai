import express from "express";
import verifyToken from "../../../middlewares/verifyToken.js";
import controller from "./adminStorage.controller.js";
import multer from "multer";
import { viewAccessCheck, editAccessCheck } from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(verifyToken);
router.get("/", viewAccessCheck, controller.get.bind(controller));
router.put("/", editAccessCheck, controller.save.bind(controller));
router.post("/test", editAccessCheck, upload.single("logo"), controller.test.bind(controller));

export default router;
