import Response from '../utils/response.js';
import { PermissionMiddlewareMessage } from '../language/language.translator.js';
import { viewPermissionConfigChecker, createPermissionConfigChecker, editPermissionConfigChecker, deletePermissionConfigChecker } from './permissionConfigChecker.js';

async function viewAccessCheck(req, res, next) {
  try {
      const result = req.verified;
      const userData = result.userData;

    //   if (userData.memberId) {
    //       const mainPath = req?.mainRoute;
    //       const pathCheck = viewPermissionConfigChecker(mainPath);
    //       const roleWithPermission = req.verified.permissionConfig;
    //       const permissionConfig = roleWithPermission[0]?.permissionConfig;

    //       if (!pathCheck || !permissionConfig?.[pathCheck]?.view) {
    //           return res.status(400).send(Response.accessDeniedResp(`${PermissionMiddlewareMessage['VIEW_ACCESS_DENIED']['en']} ${pathCheck} module ⚠️.`));
    //       }
    //   }
      next();
  } catch (err) {
    return res.send(Response.FailResp(PermissionMiddlewareMessage['FAILED_ACCESS']['en']));
  }
}

async function createAccessCheck(req, res, next) {
    try {   
        let result = req.verified;
        if(result.userData.memberId){
            let mainPath = req?.mainRoute;
            let pathCheck = createPermissionConfigChecker(mainPath);
                const roleWithPermission = req.verified.permissionConfig;
              const permissionConfig = roleWithPermission[0]?.permissionConfig;
            if (!pathCheck || !permissionConfig[pathCheck]?.create) {
                return res.status(400).send(Response.accessDeniedResp(`${PermissionMiddlewareMessage['CREATE_ACCESS_DENIED']['en']} ${pathCheck} module ⚠️.`));
            }
        }
        next();
    } catch (err) {        
        return res.send(Response.FailResp(PermissionMiddlewareMessage['FAILED_ACCESS']['en']));
    }
}
async function editAccessCheck(req, res, next) {
    try {   
        let result = req.verified;
        if(result.userData.memberId){
            let mainPath = req?.mainRoute;
            let pathCheck = editPermissionConfigChecker(mainPath);
            const roleWithPermission = req.verified.permissionConfig;
            const permissionConfig = roleWithPermission[0]?.permissionConfig;
            if (!pathCheck || !permissionConfig[pathCheck]?.edit) {
                return res.status(400).send(Response.accessDeniedResp(`${PermissionMiddlewareMessage['EDIT_ACCESS_DENIED']['en']} ${pathCheck} module ⚠️.`));
            }
        }
        next();
    } catch (err) {
        return res.send(Response.FailResp(PermissionMiddlewareMessage['FAILED_ACCESS']['en']));
    }
}

async function deleteAccessCheck(req, res, next) {
    try {   
        let result = req.verified;
        if(result.userData.memberId){
            let mainPath = req?.mainRoute;
            let pathCheck = deletePermissionConfigChecker(mainPath);
            const roleWithPermission = req.verified.permissionConfig;
            const permissionConfig = roleWithPermission[0]?.permissionConfig;
            if (!pathCheck || !permissionConfig[pathCheck]?.delete) {
                return res.status(400).send(Response.accessDeniedResp(`${PermissionMiddlewareMessage['DELETE_ACCESS_DENIED']['en']} ${pathCheck} module ⚠️.`));
            }
        }
        next();
    } catch (err) {
        return res.send(Response.FailResp(PermissionMiddlewareMessage['FAILED_ACCESS']['en']));
    }
}

export { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck };
