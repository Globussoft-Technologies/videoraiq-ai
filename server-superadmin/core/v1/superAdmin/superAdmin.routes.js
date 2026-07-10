import Router from 'express';
const router = Router();
import superAdminController from './superAdmin.controller.js';

router.post('/signup', superAdminController.signUp);
router.post('/signin', superAdminController.signIn);
router.post('/forgot-password', superAdminController.forgotPassword);
router.post('/reset-password', superAdminController.resetPassword);

export default router;
