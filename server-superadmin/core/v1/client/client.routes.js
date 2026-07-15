import Router from 'express';
const router = Router();
import clientController from './client.controller.js';
import verifySuperAdmin from '../../../middlewares/verifySuperAdmin.js';

router.get('/admins', verifySuperAdmin, clientController.listAdmins);
router.get('/overview', verifySuperAdmin, clientController.fleetOverview);
router.get('/top-alerts', verifySuperAdmin, clientController.topClientsByAlertVolume);
router.get('/alerts-graph', verifySuperAdmin, clientController.alertsGraph);
router.get('/:adminId/cameras', verifySuperAdmin, clientController.getClientCameras);
router.patch('/:adminId/cameras/:cameraId/detections', verifySuperAdmin, clientController.updateCameraDetection);

export default router;
