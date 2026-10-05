import Router from "express";
import assistantController from "./assistant.controller.js";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/conversations", (req, res) => assistantController.list(req, res));
router.get("/conversations/:conversationId/attachments/:attachmentId", (req, res) => assistantController.attachment(req, res));
router.get("/conversations/:conversationId", (req, res) => assistantController.get(req, res));
router.patch("/conversations/:conversationId", (req, res) => assistantController.rename(req, res));
router.delete("/conversations/:conversationId", (req, res) => assistantController.remove(req, res));
router.post("/chat", (req, res) => assistantController.chat(req, res));
router.post("/register-user/face",upload.fields([{ name: "file", maxCount: 1 }, { name: "files", maxCount: 3 }]),
  (req, res) => assistantController.uploadRegisterUserFace(req, res)
);

export default router;
