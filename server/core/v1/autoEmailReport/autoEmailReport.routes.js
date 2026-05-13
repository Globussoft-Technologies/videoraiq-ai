import Router from 'express';
import autoReportEmailController from './autoEmailReport.controller.js';
import verifyToken from '../../../middlewares/verifyToken.js';
const router = Router();


router.post('/createAutoEmailReport',autoReportEmailController.createAutoEmailReport);
router.post('/get', autoReportEmailController.fetchReportDetails);
router.post('/Update',autoReportEmailController.updateReport);
router.post('/delete',autoReportEmailController.deleteReport);


export default router;