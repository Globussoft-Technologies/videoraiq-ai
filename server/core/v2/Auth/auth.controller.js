import AUTHService from "./auth.service.js";


class authController {
    async verifyUserbyLogin(req, res, next) {
        /* #swagger.tags = ['Auth']
                            #swagger.description = 'This routes is used to verify user by login and password' */    
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'Token payload',
                                required: false,
                                schema: { $ref: "#/definitions/login" }
                                
        } */
        /*#swagger.security = [] */
        return await AUTHService.verifyUser(req, res, next);
     }

    async verifyUserbyDecode(req, res, next) {
        /* #swagger.tags = ['Auth']
                            #swagger.description = 'This routes is used to decode token' */
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'Token payload',
                                required: false,
                                schema: { $ref: "#/definitions/decodeToken" }
        } */
        /*#swagger.security = [] */
       return await AUTHService.decodeToken(req, res, next);
    }

    async verifyImpersonation(req, res, next) {
        return await AUTHService.verifyImpersonation(req, res, next);
    }

    async verifyAmemberSso(req, res, next) {
        return await AUTHService.verifyAmemberSso(req, res, next);
    }

    async generateAdminToken(req, res, next) {
        /* #swagger.tags = ['Auth']
                            #swagger.description = 'Generate an encrypted admin token valid for N days (max 5). Body: { adminId, days }. Requires an authenticated token.' */
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                required: true,
                                schema: { adminId: '507f1f77bcf86cd799439011', days: 5 }
        } */
        return await AUTHService.generateAdminToken(req, res, next);
    }

    async getFromAmemberUserDetails(req, res, next) {
        /* #swagger.tags = ['Auth']
                            #swagger.description = 'This routes is used to get user details from aMember by username' */
        /*	#swagger.parameters['username'] = {
                                in: 'path',
                                description: 'Username of the user',
                                required: true
        } */
        /*#swagger.security = [] */
       return await AUTHService.getAmemberUserDetails(req, res, next);
    }
}
export default new authController();
