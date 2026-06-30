
import authorizedUsersService from "./authorizedUsers.service.js";


class AuthUserController {
  /**
   * Delete all authorized users for the current admin.
   * Only deletes SFTP/AI data if user is verified.
   */
  async deleteAllAuthUsers(req, res, next) {
    /*
    #swagger.tags = ['AuthorizedUsers']
    #swagger.description = 'Delete all authorized users for the current admin. Only deletes SFTP/AI data if user is verified.'
    #swagger.responses[200] = {
      description: 'All authorized users deleted successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.deleteAllAuthUsers(req, res, next);
  }

  async fetchAuthUser(req,res,next){
    /* 
    #swagger.tags = ['AuthorizedUsers']
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
    #swagger.parameters['verified'] = {
              in: 'query',
              description: 'Provide verified status true or false',
              required: false,
              type: 'boolean',
    }
    #swagger.parameters['search'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Search by user name (case-insensitive)'
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
  #swagger.tags = ['AuthorizedUsers']
  #swagger.description = 'Create Authorized User'
  #swagger.consumes = ['multipart/form-data']
  */

  /* #swagger.parameters['file'] = {
        in: 'formData',
        type: 'array',
        required: false,
        collectionFormat: 'multi',
        description: 'Upload profile pictures (max 3)',
        items: { type: 'file' }
  } */

  /* #swagger.parameters['firstName'] = {
        in: 'formData',
        type: 'string',
        required: true
  } */

  /* #swagger.parameters['lastName'] = {
        in: 'formData',
        type: 'string',
        required: true
  } */

  /* #swagger.parameters['email'] = {
        in: 'formData',
        type: 'string',
        required: true
  } */

  /* #swagger.parameters['password'] = {
        in: 'formData',
        type: 'string',
        required: true
  } */

  /* #swagger.parameters['roleIds'] = {
        in: 'formData',
        type: 'array',
        collectionFormat: 'multi',
        required: true,
        items: { type: 'string' }
  } */

  /* #swagger.parameters['departmentId'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */


    return authorizedUsersService.createAuthUser(req, res, next);
  }

  async updateAuthUser(req,res,next){
    /* 
    #swagger.tags = ['AuthorizedUsers']
    #swagger.description = 'To update AuthorizedUsers .'
    #swagger.parameters['userId'] = {
              in: 'query',
              description: 'Provide users _id',
              required: true,
              type: 'string',
    }

      #swagger.consumes = ['multipart/form-data']
  */

  /* #swagger.parameters['file'] = {
        in: 'formData',
        type: 'array',
        required: false,
        collectionFormat: 'multi',
        description: 'Upload profile pictures (max 3)',
        items: { type: 'file' }
  } */

  /* #swagger.parameters['firstName'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */

  /* #swagger.parameters['lastName'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */

  /* #swagger.parameters['email'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */

  /* #swagger.parameters['departmentId'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */


  /* #swagger.parameters['profilePics'] = {
        in: 'formData',
        type: 'array',
        required: false,
        collectionFormat: 'multi',
        description: 'Upload profile pictures URL which you want to keep in DB (max 3)',
        items: { type: 'string' }
  } */

  /* #swagger.parameters['designation'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */

  /* #swagger.parameters['branch'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */

  /* #swagger.parameters['shiftId'] = {
        in: 'formData',
        type: 'string',
        required: false
  } */

    /*#swagger.responses[201] = {
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
    #swagger.tags = ['AuthorizedUsers']
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
    #swagger.tags = ['AuthorizedUsers']
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

  async bulkImportAuthUser(req,res,next){
    /* 
    #swagger.tags = ['AuthorizedUsers']
    #swagger.description = 'To bulk import AuthorizedUsers .'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/bulkImportAuthUser' }
    }
    #swagger.responses[201] = {
      description: 'AuthorizedUsers bulk imported successfully'
    }
    #swagger.responses[400] = {
      description: 'Validation error or missing required fields'
    }
    #swagger.responses[500] = {
      description: 'Internal server error'
    }
    */
    return authorizedUsersService.bulkImportAuthUser(req, res, next);
  }

  async fetchUniqueLocations(req, res, next) {
    /* 
    #swagger.tags = ['AuthorizedUsers']
    #swagger.description = 'To get unique locations.'
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
    #swagger.parameters['search'] = {
              in: 'query',
              description: 'Provide search',
              required: false,
              type: 'String',
    }
    */
    return authorizedUsersService.fetchUniqueLocations(req, res, next);
  }
  
  async tagUser(req, res, next) {
    /*
    #swagger.tags = ['AuthorizedUsers']
    #swagger.description = 'Tag or untag an authorized user. Can use either userId (query param) or accessLogId (body param). Calls AI service (/tag or /untag) and updates tag status on both the authorized user and the access log on success.'
    #swagger.parameters['userId'] = {
      in: 'query',
      description: 'Authorized user _id to tag/untag (optional if accessLogId provided)',
      required: false,
      type: 'string',
    }
    #swagger.parameters['data'] = {
      in: 'body',
      required: true,
      schema: {
        tag: true,
        profileImages: ['https://example.com/images/photo.jpg'],
        accessLogId: '664f1a2b3c4d5e6f7a8b9c0d'
      }
    }
    #swagger.responses[200] = { description: 'User tag updated successfully' }
    #swagger.responses[400] = { description: 'Validation error - must provide either userId or accessLogId' }
    #swagger.responses[404] = { description: 'User, access log, or admin not found, or no face match in AI service' }
    #swagger.responses[502] = { description: 'AI service error' }
    #swagger.responses[500] = { description: 'Internal server error' }
    */
    return authorizedUsersService.tagUser(req, res, next);
  }

  async verifyUser(req,res,next){
    /* 
    #swagger.tags = ['AuthorizedUsers']
    #swagger.description = 'To verify AuthorizedUsers .'
    #swagger.consumes = ['multipart/form-data']

    #swagger.parameters['file'] = {
          in: 'formData',
          type: 'array',
          required: false,
          collectionFormat: 'multi',
          description: 'Upload user image',
          items: { type: 'file' }
    } */
    return authorizedUsersService.verifyUser(req, res, next);
  }

}

export default new AuthUserController();