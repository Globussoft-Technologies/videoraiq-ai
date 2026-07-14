import Router from 'express';
import dashboardController from './dashboard.controller.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

router.post('/headerStats',viewAccessCheck,dashboardController.headerStats);
router.post('/criticalityStats',viewAccessCheck,dashboardController.criticalityStats);
router.post('/detectionChart',viewAccessCheck,dashboardController.detectionChart);
router.post('/dashboardWeeklyComparisonChart',viewAccessCheck,dashboardController.WeeklyComparisonChart);

router.get('/getSidebarConfig',viewAccessCheck,dashboardController.getSidebarConfig);
router.put('/updateSidebarConfig',dashboardController.updateSidebarConfig);


router.get('/getIncidentsByType',viewAccessCheck,dashboardController.getIncidentsByType);
router.get('/recentIncidents',viewAccessCheck,dashboardController.recentIncidents);
router.post('/getDetections',viewAccessCheck,dashboardController.getDetections);



export default router;