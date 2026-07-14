import Router from 'express';
const router = Router();
import alertsController from './alerts.controller.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


router.post('/create',alertsController.createAlert);
router.post('/update',alertsController.updateAlert);
router.get('/fetch',alertsController.fetchAllAlerts);
router.delete('/delete',alertsController.deleteAlerts);
export default router;