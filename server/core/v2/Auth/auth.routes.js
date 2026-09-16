import Router from 'express';
const router = Router();
import authController from './auth.controller.js'
import verifyToken from '../../../middlewares/verifyToken.js';

router.post('/by-login-pass',authController.verifyUserbyLogin);
router.post('/by-login-token',authController.verifyUserbyDecode);
router.post('/by-impersonation-token', authController.verifyImpersonation);
router.post('/by-amember-sso-token', authController.verifyAmemberSso);
router.get('/by-login/:username', authController.getFromAmemberUserDetails)
router.post('/generate-admin-token', verifyToken, authController.generateAdminToken);
router.get('/registration-link', verifyToken, authController.getRegistrationLink);
router.delete('/registration-link', verifyToken, authController.terminateRegistrationLink);
router.get('/registration-link/validate', verifyToken, (_req, res) => res.status(200).json({ ok: true }));
export default router;
