import Router from 'express';
const router = Router();
import verifyToken from '../../../middlewares/verifyToken.js';
import uploadsController from './uploads.controller.js';
import multer from 'multer';
import { debugPool } from '../../../utils/newSFTPConnectionCheck.js';
const upload = multer(); // memory storage


router.get('/debug/pool-stats', (_, res) => {
  try {
    const stats = debugPool();
    return res.status(200).json({
      status: 'success',
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/media', upload.single('file'), uploadsController.uploadMedia);
router.get('/:mediaPath(*)', uploadsController.fetchMedia);
router.delete('/deleteMedia', upload.single('file'), uploadsController.deleteMedia);
router.delete('/deleteUserMedia', upload.single('file'), uploadsController.deleteUserMedia);

export default router;