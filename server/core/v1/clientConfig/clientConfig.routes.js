import express from "express";
const router = express.Router();
import verifyToken from "../../../middlewares/verifyToken.js";
import clientConfigController from "./clientConfig.controller.js";

// Read-only, and reachable by both an admin token and a member ("user") token.
//
// verifyToken puts the JWT payload on req.verified.userData for both, and a
// member's token carries the adminId of the client they belong to — so every
// handler here resolves the same tenant either way.
//
// Deliberately no viewAccessCheck: that middleware resolves a permission module
// from the request path, and /client-config has no entry in
// permissionConfigChecker's viewPathMap. Its permission body is commented out
// today so it would pass, but the moment that block is restored an unmapped
// path returns '' and every member would be denied — the opposite of the
// requirement. Adding a module instead would mean a new permission key plus a
// backfill across existing roles, which is a lot of machinery for read-only
// data about the caller's own account.
//
// The superadmin equivalents take :adminId in the path; these take the tenant
// from the token, so there is nothing for a caller to tamper with. See
// clientConfig.service.js.
router.get("/account", verifyToken, clientConfigController.getAccount);
router.get("/", verifyToken, clientConfigController.getConfig);
router.get("/cameras", verifyToken, clientConfigController.getCameras);

export default router;
