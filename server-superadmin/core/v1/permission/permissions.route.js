import Router from 'express';
import verifyToken from '../../../middlewares/verifyToken.js';
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';

const router = Router();


import PermissionController from './permissions.controller.js';

router.post('/create' ,verifyToken,createAccessCheck, PermissionController.create);
router.get('/fetch',verifyToken,viewAccessCheck,PermissionController.fetchPermissions);
router.put('/update' ,verifyToken,editAccessCheck, PermissionController.updatePermissions);
router.delete('/delete',verifyToken,deleteAccessCheck, PermissionController.deletePermissions);

router.post('/roles_permissions',verifyToken,viewAccessCheck,PermissionController.fetchRolesPermission);
router.post('/bulk-permissionConfig-update',verifyToken,editAccessCheck,PermissionController.bulkPermissionUpdate);
router.post('/bulk-permissionConfig-delete',verifyToken,deleteAccessCheck,PermissionController.bulkPermissionDelete);
router.put('/update-admin-permissions',verifyToken,editAccessCheck,PermissionController.updateAdminPermissions);

//User Permission's
router.get('/user-permissions',verifyToken,PermissionController.userPermissions);

export default router;
