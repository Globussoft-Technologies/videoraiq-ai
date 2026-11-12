import Router from 'express';
const router = Router();
import verifyToken from '../../../middlewares/verifyToken.js';
import uploadsController from './uploads.controller.js';
import multer from 'multer';
import { authorizeMediaRead } from './mediaAuthorization.js';
import { MAX_FILE_UPLOAD_BYTES } from './uploads.service.js';
const upload = multer(); // memory storage
const fileUpload = multer({ limits: { fileSize: MAX_FILE_UPLOAD_BYTES, files: 1, fields: 10 } });

router.post('/media', verifyToken, (req, res, next) => {
  const receiver = req.query.mediaType === 'file' ? fileUpload : upload;
  receiver.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        status: 'failed', message: error.code === 'LIMIT_FILE_SIZE' ? 'Files must not exceed 25 MB.' : error.message,
      });
    }
    next(error);
  });
}, uploadsController.uploadMedia);
router.post('/zip', verifyToken, authorizeMediaRead, uploadsController.downloadZip);
router.get('/:mediaPath(*)', uploadsController.fetchMedia);
router.delete('/deleteMedia', verifyToken, upload.single('file'), uploadsController.deleteMedia);
router.delete('/deleteUserMedia', verifyToken, upload.single('file'), uploadsController.deleteUserMedia);

export default router;
