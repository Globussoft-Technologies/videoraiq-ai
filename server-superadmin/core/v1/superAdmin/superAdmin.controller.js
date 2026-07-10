import superAdminService from "./superAdmin.service.js";

class SuperAdminController {
    async signUp(req, res, next) {
        /* #swagger.tags = ['SuperAdmin'] */
        /* #swagger.description = 'Register a new super admin' */
        /* #swagger.security = [] */
        /* #swagger.parameters['data'] = {
                in: 'body',
                required: true,
                schema: { $ref: "#/definitions/superAdminSignUp" }
        } */
        return await superAdminService.signUp(req, res, next);
    }
    async signIn(req, res, next) {
        /* #swagger.tags = ['SuperAdmin'] */
        /* #swagger.description = 'Sign in a super admin and receive a JWT' */
        /* #swagger.security = [] */
        /* #swagger.parameters['data'] = {
                in: 'body',
                required: true,
                schema: { $ref: "#/definitions/superAdminSignIn" }
        } */
        return await superAdminService.signIn(req, res, next);
    }
    async forgotPassword(req, res, next) {
        /* #swagger.tags = ['SuperAdmin'] */
        /* #swagger.description = 'Send a password reset OTP to the super admin email' */
        /* #swagger.security = [] */
        /* #swagger.parameters['data'] = {
                in: 'body',
                required: true,
                schema: { $ref: "#/definitions/superAdminForgotPassword" }
        } */
        return await superAdminService.forgotPassword(req, res, next);
    }
    async resetPassword(req, res, next) {
        /* #swagger.tags = ['SuperAdmin'] */
        /* #swagger.description = 'Reset the super admin password using the emailed OTP' */
        /* #swagger.security = [] */
        /* #swagger.parameters['data'] = {
                in: 'body',
                required: true,
                schema: { $ref: "#/definitions/superAdminResetPassword" }
        } */
        return await superAdminService.resetPassword(req, res, next);
    }
}

export default new SuperAdminController();
