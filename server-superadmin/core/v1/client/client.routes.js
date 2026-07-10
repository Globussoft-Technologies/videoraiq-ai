import Router from 'express';
const router = Router();
import clientController from './client.controller.js';
import verifySuperAdmin from '../../../middlewares/verifySuperAdmin.js';

router.get('/admins', verifySuperAdmin, clientController.listAdmins);
router.get('/:adminId/cameras', verifySuperAdmin, clientController.getClientCameras);

export default router;
