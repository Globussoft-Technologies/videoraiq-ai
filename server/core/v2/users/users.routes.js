import Router from 'express';
import verifyToken from '../../../middlewares/verifyToken.js';
import authUserController from "./users.controller.js"
import emailVerificationService from "./emailVerification.service.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';
import { auth } from 'googleapis/build/src/apis/abusiveexperiencereport/index.js';

const router = Router();

router.post("/login",authUserController.authUserLogin);
// A new user's email must be verified (link mailed to it) before the user is saved.
// /verify is the link itself, so it is public; the others need a logged-in admin.
router.post("/email-verification/send", verifyToken, (req, res) => emailVerificationService.send(req, res));
router.post("/email-verification/verify", (req, res) => emailVerificationService.verify(req, res));
router.get("/email-verification/status", verifyToken, (req, res) => emailVerificationService.status(req, res));
router.post("/forgot-password",authUserController.forgotPassword);
router.post("/reset-password",authUserController.resetPassword);
router.post("/change-password",verifyToken,authUserController.changePassword);
router.post("/fetch",verifyToken,viewAccessCheck,authUserController.fetchAuthUser);
router.post("/create",verifyToken,createAccessCheck,authUserController.createAuthUser);
router.put("/update",verifyToken,editAccessCheck,authUserController.updateAuthUser);
router.delete("/delete",verifyToken,deleteAccessCheck,authUserController.deleteAuthUser);
router.delete("/bulk-delete",verifyToken,deleteAccessCheck,authUserController.bulkDeleteAuthUser);

router.get("/isEmailExist",verifyToken,authUserController.isEmailExist);
router.post("/check-emp-admin",verifyToken,authUserController.checkEmpAdmin);


router.post('/allOrgEmployee',verifyToken, viewAccessCheck,authUserController.allOrgEmployee);
router.post("/import-users",verifyToken,createAccessCheck,authUserController.importUsers);
router.get("/import-users-progress",verifyToken,viewAccessCheck,authUserController.getImportProgress);








export default router;