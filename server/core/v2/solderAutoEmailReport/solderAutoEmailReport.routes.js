import express from 'express';
import service from './solderAutoEmailReport.service.js';

const router = express.Router();
// Match the existing Auto Email Reports permissions and solder-log visibility.
const access = (action) => (req, res, next) => {
  if (!req.verified?.userData?.adminId || req.verified.userData.user_id == null) return res.status(401).json({ message: 'Authentication required.' });
  if (req.verified.userData.memberId) {
    const permissions = req.verified.permissionConfig?.[0]?.permissionConfig;
    const logs = permissions?.logs;
    const canView = logs?.deskSolarShoulderLogs?.view ?? logs?.global?.view ?? logs?.view;
    const allowed = (Array.isArray(action) ? action : [action]).some((key) => permissions?.autoEmailReports?.[key]);
    if (!canView || !allowed) return res.status(403).json({ message: 'You do not have permission to manage solder email reports.' });
  }
  next();
};
router.get('/form-options', access('view'), (req, res) => service.formOptions(req, res));
router.get('/', access('view'), (req, res) => service.list(req, res));
router.post('/preview', access('view'), (req, res) => service.draft(req, res));
router.post('/send-test', access(['create', 'edit']), (req, res) => service.draft(req, res, true));
router.post('/', access('create'), (req, res) => service.save(req, res));
router.put('/:id', access('edit'), (req, res) => service.save(req, res));
router.patch('/:id', access('edit'), (req, res) => service.setEnabled(req, res));
export default router;
