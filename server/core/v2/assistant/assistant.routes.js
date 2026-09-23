import Router from "express";
import assistantController from "./assistant.controller.js";

const router = Router();

router.get("/conversations", (req, res) => assistantController.list(req, res));
router.get("/conversations/:conversationId", (req, res) => assistantController.get(req, res));
router.patch("/conversations/:conversationId", (req, res) => assistantController.rename(req, res));
router.delete("/conversations/:conversationId", (req, res) => assistantController.remove(req, res));
router.post("/chat", (req, res) => assistantController.chat(req, res));

export default router;
