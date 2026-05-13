
import authorizedUsersService from "./users.service.js";


class UserController {

  async fetchAuthUser(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To get AuthorizedUsers .'
    #swagger.parameters['userId'] = {
              in: 'query',
              description: 'Provide users _id',
              required: false,
              type: 'string',
    }
    #swagger.parameters['skip'] = {
              in: 'query',
              description: 'Provide skip',
              required: false,
              type: 'Number',
    }
    #swagger.parameters['limit'] = {
              in: 'query',
              description: 'Provide users limit',
              required: false,
              type: 'Number',
    }
    #swagger.parameters['searchQuery'] = {
              in: 'query',
              description: 'Provide searchQuery',
              required: false,
              type: 'string',
    }
    #swagger.parameters['orderBy'] = {
                            in: 'query',
                            description: 'keyword to be ordered',
                            enum: ['userName','firstName','lastName', 'createdAt', 'updatedAt'],
        }
    #swagger.parameters['sort'] = {
                            in: 'query',
                            description: 'sorting parameters(asc or desc)',
                            enum: ['asc', 'desc'],
    }              
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/fetchAuthUser' }
    }
    #swagger.responses[201] = {
      description: 'AuthorizedUsers fetched successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.fetchAuthUser(req, res, next);
  }
  async createAuthUser(req, res, next) {
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To add AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/createUser' }
    }
    #swagger.responses[201] = {
      description: 'AuthorizedUsers created successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */

    return authorizedUsersService.createAuthUser(req, res, next);
  }

  async updateAuthUser(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To update AuthorizedUsers .'
    #swagger.parameters['userId'] = {
              in: 'query',
              description: 'Provide users _id',
              required: true,
              type: 'string',
    }
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/updateUser' }
    }
    #swagger.responses[201] = {
      description: 'AuthorizedUsers updated successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */

    return authorizedUsersService.updateAuthUser(req, res, next);
  }

  async deleteAuthUser(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To delete AuthorizedUsers .'
    #swagger.parameters['userId'] = {
              in: 'query',
              description: 'Provide users _id',
              required: true,
              type: 'string',
    }
    #swagger.responses[201] = {
      description: 'AuthorizedUsers deleted successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.deleteAuthUser(req, res, next);
  }

  async authUserLogin(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To login AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/authUserLogin' }
    }
    #swagger.responses[201] = {
      description: 'AuthorizedUsers logged in successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    /*#swagger.security = [] */
    return authorizedUsersService.authUserLogin(req, res, next);
  }

  async bulkDeleteAuthUser(req,res,next){
    /*
    #swagger.tags = ['Users']
    #swagger.description = 'To login AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/bulkDeleteUser' }
    }*/
    return authorizedUsersService.bulkDeleteAuthUser(req, res, next);
  }
  async forgotPassword(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To forgot password AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/forgotPassword' }
    }
    #swagger.responses[201] = {
      description: 'Forgot password email sent successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.forgotPassword(req, res, next);
  }
  async resetPassword(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To reset password AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/resetPassword' }
    }
    #swagger.responses[201] = {
      description: 'Password reset successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.resetPassword(req, res, next);
  }
  async changePassword(req,res,next){
    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To change password AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/changePassword' }
    }
    #swagger.responses[201] = {
      description: 'Password changed successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.changePassword(req, res, next);
  }

  async checkEmpAdmin(req,res,next){
    /*
    #swagger.tags = ['Users']
    #swagger.description = 'Check if user is an EMP Admin by email.'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide email',
      required: true,
      schema: { email: 'string' }
    }
    #swagger.responses[200] = {
      description: 'EMP Admin status checked successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.checkEmpAdmin(req, res, next);
  }

  async isEmailExist(req,res,next){

    /* 
    #swagger.tags = ['Users']
    #swagger.description = 'To check if email exists for AuthorizedUsers .'
    #swagger.parameters['email'] = {
              in: 'query',
              description: 'Provide email',
              required: true,
              type: 'string',
    }
    #swagger.responses[201] = {
      description: 'Email existence checked successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.isEmailExist(req, res, next);
  }

    async allOrgEmployee(req, res, next) {
    /* #swagger.tags = ['Users']
                           #swagger.description = 'Api to get all organisation Employee Data'  */
    /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'Api to get all organisation Employee Data',
                                required: true,
                                schema: { $ref: "#/definitions/allOrgEmployee" }
        } */

    return await authorizedUsersService.allOrgEmployee(req, res, next);
  }

    async importUsers(req, res, next){
         /* #swagger.tags = ['Open-User']
                           #swagger.description = 'API to import Users from EmpMonitor' */
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'Import Users',
                                required: true,
                                schema: { $ref: "#/definitions/importEmpUsers" }
        } */
        return await authorizedUsersService.importUsers(req, res, next);
    }

    async getImportProgress(req, res, next) {
        /* #swagger.tags = ['Users']
           #swagger.description = 'API to get import users progress from background job' */
        return await authorizedUsersService.getImportProgress(req, res, next);
    }
}

export default new UserController();