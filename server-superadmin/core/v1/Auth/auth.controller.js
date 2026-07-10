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
