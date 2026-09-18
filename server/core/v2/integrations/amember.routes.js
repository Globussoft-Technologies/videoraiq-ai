import Router from "express";
import rateLimit from "express-rate-limit";
import authController from "../Auth/auth.controller.js";

const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Public to aMember, but authenticated by timestamped HMAC inside the service.
router.post("/users/sync", webhookLimiter, authController.syncAmemberUser);

export default router;
