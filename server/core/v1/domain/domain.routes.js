import express from "express";
import DomainController from "./domain.controller.js";
const router = express.Router();

router.post("/register", DomainController.registerDomain);

export default router;
