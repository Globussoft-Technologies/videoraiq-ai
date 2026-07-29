import Router from "express";
import { login, loginLimiter, requireEmailAuth } from "./emailAuth.js";

const router = Router();

router.post("/auth/login", loginLimiter, login);

// Everything below this line requires the 1-day dashboard token.
router.use(requireEmailAuth);

// Lets the frontend decide on page load whether the stored token is still
// valid, instead of waiting for the first data call to 401.
router.get("/auth/me", (req, res) => res.json({ username: req.emailUser }));

export default router;
