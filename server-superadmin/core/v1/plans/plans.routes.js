import Router from "express";
const router = Router();
import plansController from "./plans.controller.js";
import verifySuperAdmin from "../../../middlewares/verifySuperAdmin.js";

router.get("/", verifySuperAdmin, plansController.list);
router.post("/", verifySuperAdmin, plansController.create);
router.put("/:id", verifySuperAdmin, plansController.update);
router.delete("/:id", verifySuperAdmin, plansController.remove);

export default router;
