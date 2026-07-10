import Router from 'express';
import authorizedObjectsController from "./authorizedObjects.controller.js"
const router = Router();


router.post("/create",authorizedObjectsController.createAuthorizedObjects);
router.post("/fetch",authorizedObjectsController.fetchAuthorizedObjects);
router.get("/getAllObjectTypes",authorizedObjectsController.getAllObjectTypes);
router.put("/update",authorizedObjectsController.updateAuthorizedObjects);
router.delete("/delete",authorizedObjectsController.deleteAuthorizedObjects);

export default router;