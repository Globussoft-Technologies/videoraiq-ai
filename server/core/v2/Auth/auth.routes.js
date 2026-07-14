import Router from 'express';
const router = Router();
import authController from './auth.controller.js'

router.post('/by-login-pass',authController.verifyUserbyLogin);
router.post('/by-login-token',authController.verifyUserbyDecode);
router.get('/by-login/:username', authController.getFromAmemberUserDetails)
export default router;