import Router from 'express';
import rateLimit from 'express-rate-limit';
import AUTHService from './auth.service.js';
const router = Router();
import authController from './auth.controller.js'
import verifyToken from '../../../middlewares/verifyToken.js';

const refreshLimiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });
router.post('/refresh', refreshLimiter, (req, res) => AUTHService.refresh(req, res));
router.post('/logout', (req, res, next) => AUTHService.logout(req, res, next));

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
