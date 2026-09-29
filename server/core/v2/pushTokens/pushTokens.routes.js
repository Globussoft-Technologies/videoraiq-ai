import Router from "express";
import pushTokensService from "./pushTokens.service.js";

const router = Router();

// Any signed-in admin or user may register their own device; no module permission.
router.post("/register", (req, res) => pushTokensService.register(req, res));
router.post("/unregister", (req, res) => pushTokensService.unregister(req, res));

export default router;
