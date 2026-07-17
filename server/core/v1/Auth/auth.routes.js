import Router from 'express';
const router = Router();
import authController from './auth.controller.js'
import verifyToken from '../../../middlewares/verifyToken.js';

router.post('/by-login-pass',authController.verifyUserbyLogin);
router.post('/by-login-token',authController.verifyUserbyDecode);
router.get('/by-login/:username', authController.getFromAmemberUserDetails)
router.post('/generate-admin-token', verifyToken, authController.generateAdminToken);
export default router;