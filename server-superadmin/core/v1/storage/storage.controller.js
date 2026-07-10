import StorageService from "./storage.service.js";

class StorageController {
  async addStorage(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Add a new storage'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Storage details',
           required: true,
           
       }
       #swagger.responses[201] = {
           description: 'Storage added successfully'
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
    return StorageService.addStorage(req, res, next);
  }

  async googleAuthCallback(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Google Drive authentication callback'
       #swagger.parameters['code'] = {
           in: 'query',
           description: 'Authorization code from Google',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Google Drive authenticated successfully'
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
    return StorageService.googleAuthCallback(req, res, next);
  }
  async getStorages(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Get all storages'
       #swagger.responses[200] = {
           description: 'List of storages retrieved successfully',
       }
        #swagger.parameters['skip'] = {
            in: 'query',
            description: 'Number of storages to skip',
            required: false,
            type: 'integer',
            example: 0
          }
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Number of storages to return',
            required: false,
            type: 'integer',
            example: 10
        }
        #swagger.parameters['sortField'] = {
                             in: 'query',
                             description: 'keyword to be ordered',
                             enum: ['name', 'type', 'createdAt', 'status', 'note'],
        }       
        #swagger.parameters['sortOrder'] = {
                        in: 'query',
                        description: 'sorting parameters(asc or desc)',
                        enum: ['asc', 'desc'],
        }
        #swagger.parameters['name'] = {
            in: 'query',
            description: 'Partial or full name of the storage to search',
            required: false,
            type: 'string',
            example: 'S3 storage'
        }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return StorageService.getStorages(req, res, next);
  }
  async uploadFile(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Upload a file to storage'
       #swagger.parameters['file'] = {
           in: 'formData',
           type: 'file',
           required: true,
           description: 'File to upload'
       }
        #swagger.parameters['adminId'] = {
           in: 'formData',
           description: 'ID of the user',
           required: true,
           type: 'string'
       }
        #swagger.parameters['folderName'] = {
           in: 'formData',
           description: 'Name of the folder to upload the file to',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'File uploaded successfully'
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
    return StorageService.uploadFile(req, res, next);
  }
  async deleteStorage(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Delete a storage by ID'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'ID of the storage to delete',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Storage deleted successfully'
       }
       #swagger.responses[404] = {
           description: 'Storage not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return StorageService.deleteStorage(req, res, next);
  }
  async updateStorage(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Update a storage by ID'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'ID of the storage to update',
           required: true,
           type: 'string'
       }
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Updated storage details',
           required: true,
           schema: { $ref: "#/definitions/updateStorage" }
       }
       #swagger.responses[200] = {
           description: 'Storage updated successfully'
       }
       #swagger.responses[404] = {
           description: 'Storage not found'
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
    return StorageService.updateStorage(req, res, next);
  }
  async activateStorage(req, res, next) {
    /* #swagger.tags = ['Storage']
       #swagger.description = 'Activate a storage'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Activation details',
           required: true,
           schema: { $ref: "#/definitions/activateStorage" }
       }
       #swagger.responses[200] = {
           description: 'Storage activated successfully'
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
    return StorageService.activateStorage(req, res, next);
  }
  async streamFile(req, res, next) {
    /* #swagger.tags = ['Storage']
         #swagger.description = 'Stream a file from storage by ID'
         #swagger.parameters['id'] = {
             in: 'path',
             description: 'ID of the file to stream',
             required: true,
             type: 'string'
         }
         #swagger.responses[200] = {
             description: 'File streamed successfully'
         }
         #swagger.responses[404] = {
             description: 'File not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
        */
    return StorageService.streamFile(req, res, next);
  }

  async smartStreamFile(req, res, next) {
    /* #swagger.tags = ['Storage']
         #swagger.description = 'Smartly read a file from Global SFTP or Storage service'
         #swagger.responses[200] = {
             description: 'File streamed successfully'
         }
         #swagger.responses[404] = {
             description: 'File not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
        */
    return StorageService.smartStreamFile(req, res, next);
  }
}

export default new StorageController();
