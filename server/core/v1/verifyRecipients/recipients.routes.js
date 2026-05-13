import Router from 'express';
const router = Router();
// import alertsController from './alerts.controller.js';
import recipientsController from './recipients.controller.js';
import verifyToken from '../../../middlewares/verifyToken.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


router.post('/create',verifyToken,createAccessCheck, recipientsController.createRecipients);
router.post('/verify',recipientsController.verify);
router.post('/resendMailOrSMS',verifyToken,recipientsController.resendMailOrSMS);
router.get('/fetch',verifyToken,viewAccessCheck,recipientsController.fetchRecipients);
router.delete('/delete',verifyToken,deleteAccessCheck,recipientsController.deleteRecipients);
router.put('/update',verifyToken,editAccessCheck,recipientsController.updateRecipient);
export default router;