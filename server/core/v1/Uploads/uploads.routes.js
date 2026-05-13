import Router from 'express';
const router = Router();
import verifyToken from '../../../middlewares/verifyToken.js';
import uploadsController from './uploads.controller.js';
import multer from 'multer';
const upload = multer(); // memory storage


router.post('/media',upload.single('file'),uploadsController.uploadMedia);
router.get('/:mediaPath(*)',uploadsController.fetchMedia);
router.delete('/deleteMedia',upload.single('file'),uploadsController.deleteMedia);
router.delete('/deleteUserMedia',upload.single('file'),uploadsController.deleteUserMedia);

export default router;