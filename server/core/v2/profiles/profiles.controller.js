import ProfileService from "./profiles.service.js";

class ProfilesController {
  async getProfiles(req, res, next) {
    /* #swagger.tags = ['Profiles']
        #swagger.description = 'GET profiles'
        #swagger.parameters['skip'] = {
            in: 'query',
            description: 'Number of profiles to skip',
            required: false,
            type: 'integer',
            example: 0
          }
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Number of profiles to return',
            required: false,
            type: 'integer',
            example: 10
        }
        #swagger.parameters['orderBy'] = {
                             in: 'query',
                             description: 'keyword to be ordered',
                             enum: ['name', 'createdBy', 'createdAt', 'lastModified', 'status'],
        }       
        #swagger.parameters['sort'] = {
                        in: 'query',
                        description: 'sorting parameters(asc or desc)',
                        enum: ['asc', 'desc'],
        } 
        #swagger.parameters['name'] = {
            in: 'query',
            description: 'Partial or full name of the profile to search',
            required: false,
            type: 'string',
            example: 'Day profile'
        }
        #swagger.responses[200] = {
            description: 'Profiles retrieved successfully'
        }
        #swagger.responses[500] = {
            description: 'Internal server error'
        }
        #swagger.security = [{
            "EncryptedAuthToken": []
        }]
    */
    return ProfileService.getProfiles(req, res, next);
  }
  async addProfile(req, res, next) {
    /* #swagger.tags = ['Profiles']
       #swagger.description = 'Add a new profile'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Profile details',
           required: true,
           schema: { $ref: "#/definitions/addProfile" }
       }
       #swagger.responses[201] = {
           description: 'Profile added successfully'
       }
       #swagger.responses[400] = {
           description: 'Validation error or missing required fields'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return ProfileService.addProfile(req, res, next);
  }
  async editProfile(req, res, next) {
    /* #swagger.tags = ['Profiles']
         #swagger.description = 'Edit an existing profile'
         #swagger.parameters['id'] = {
             in: 'path',
             description: 'Profile ID',
             required: true,
             type: 'string'
         }
         #swagger.parameters['data'] = {
             in: 'body',
             description: 'Updated profile details',
             required: true,
             schema: { $ref: "#/definitions/addProfile" }
         }
         #swagger.responses[200] = {
             description: 'Profile updated successfully'
         }
         #swagger.responses[400] = {
             description: 'Validation error or missing required fields'
         }
         #swagger.responses[404] = {
             description: 'Profile not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return ProfileService.editProfile(req, res, next);
  }
  async deleteProfile(req, res, next) {
    /* #swagger.tags = ['Profiles']
         #swagger.description = 'Delete a profile'
         #swagger.parameters['id'] = {
             in: 'path',
             description: 'Profile ID',
             required: true,
             type: 'string'
         }
         #swagger.responses[200] = {
             description: 'Profile deleted successfully'
         }
         #swagger.responses[404] = {
             description: 'Profile not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return ProfileService.deleteProfile(req, res, next);
  }
  async getProfileById(req, res, next) {
    /* #swagger.tags = ['Profiles']
         #swagger.description = 'Get profile by ID'
         #swagger.parameters['id'] = {
             in: 'path',
             description: 'Profile ID',
             required: true,
             type: 'string'
         }
         #swagger.responses[200] = {
             description: 'Profile details retrieved successfully'
         }
         #swagger.responses[404] = {
             description: 'Profile not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return ProfileService.getProfileById(req, res, next);
  }
  async exportProfile(req, res, next) {
    /* #swagger.tags = ['Profiles']
         #swagger.description = 'Export profile by ID'
         #swagger.parameters['id'] = {
             in: 'path',
             description: 'Profile ID',
             required: true,
             type: 'string'
         }
         #swagger.responses[200] = {
             description: 'Profile exported successfully'
         }
         #swagger.responses[404] = {
             description: 'Profile not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return ProfileService.exportProfile(req, res, next);
  }
  async bulkExportProfiles(req, res, next) {
    /* #swagger.tags = ['Profiles']
        #swagger.description = 'Bulk export profiles'
        #swagger.parameters['ids'] = {
            in: 'body',
            description: 'Array of profile IDs to export',
            required: true,
            schema: { $ref: "#/definitions/bulkExportProfiles" }
        }
        #swagger.responses[200] = {
            description: 'Profiles exported successfully'
        }
        #swagger.responses[400] = {
            description: 'Validation error or missing required fields'
        }
        #swagger.responses[500] = {
            description: 'Internal server error'
        }
           #swagger.security = [{
            "EncryptedAuthToken": []
       }]
       */
    return ProfileService.bulkExportProfiles(req, res, next);
  }
  async importProfile(req, res, next) {
    /* #swagger.tags = ['Profiles']
        #swagger.description = 'Import profile'
        #swagger.parameters['file'] = {
           in: 'formData',
           type: 'file',
           required: true,
           description: 'File to import'
       }
         #swagger.responses[201] = {
             description: 'Profile imported successfully'
         }
         #swagger.responses[400] = {
             description: 'Validation error or missing required fields'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return ProfileService.importProfile(req, res, next);
  }
  async bulkDeleteProfiles(req, res, next) {
    /* #swagger.tags = ['Profiles']
            #swagger.description = 'Bulk delete profiles'
            #swagger.parameters['ids'] = {
                in: 'body',
                description: 'Array of profile IDs to delete',
                required: true,
                schema: { $ref: "#/definitions/bulkExportProfiles" }
            }
            #swagger.responses[200] = {
                description: 'Profiles deleted successfully'
            }
            #swagger.responses[400] = {
                description: 'Validation error or missing required fields'
            }
            #swagger.responses[500] = {
                description: 'Internal server error'
            }
             #swagger.security = [{
                "EncryptedAuthToken": []
         }]
         */
    return ProfileService.bulkDeleteProfiles(req, res, next);
  }
}

export default new ProfilesController();
