import NVRService from "./nvr.service.js";

class NVRController {
  async registerNvr(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Register a new NVR and store its associated camera details'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'NVR registration details',
           required: true,
           schema: { $ref: "#/definitions/registerNVR" }
       }
       #swagger.responses[201] = {
           description: 'NVR and cameras registered successfully'
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
    return NVRService.registerNvr(req, res, next);
  }

  async allNvrs(req, res, next) {
    /* #swagger.tags = ['NVR']
         #swagger.description = 'Retrieve all NVRs'
         #swagger.responses[200] = {
             description: 'List of NVRs returned successfully'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
        #swagger.security = [{
         "EncryptedAuthToken": []
        }]
        */
    return NVRService.allNvrs(req, res, next);
  }

  async updateNvr(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Update details of an existing NVR'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Updated NVR details',
           required: true,
           schema: { $ref: "#/definitions/updateNVR" }
       }
       #swagger.responses[200] = {
           description: 'NVR updated successfully'
       }
       #swagger.responses[400] = {
           description: 'Validation error or missing required fields'
       }
       #swagger.responses[404] = {
           description: 'NVR not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return NVRService.updateNvr(req, res, next);
  }

  async updateNvrChannels(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Refetch and update channels for a specific NVR'
       #swagger.responses[200] = {
           description: 'NVR channels updated successfully'
       }
       #swagger.responses[404] = {
           description: 'NVR not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return NVRService.updateNvrChannels(req, res, next);
  }

  async deleteNvr(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Delete an NVR and its associated cameras'
       
       #swagger.responses[200] = {
           description: 'NVR and associated cameras deleted successfully'
       }
       #swagger.responses[404] = {
           description: 'NVR not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return NVRService.deleteNvr(req, res, next);
  }

  async getNvrById(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Retrieve an NVR by its ID'
       #swagger.responses[200] = {
           description: 'NVR retrieved successfully'
       }
       #swagger.responses[404] = {
           description: 'NVR not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return NVRService.getNvrById(req, res, next);
  }

  async getAllNvrs(req, res, next) {
    /* #swagger.tags = ['NVR']
         #swagger.description = 'Retrieve all NVRs'
         #swagger.parameters['skip'] = {
            in: 'query',
            description: 'Number of NVRs to skip',
            required: false,
            type: 'integer',
            example: 0
          }
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Number of NVRs to return',
            required: false,
            type: 'integer',
            example: 10
        }
         #swagger.responses[200] = {
             description: 'List of NVRs returned successfully'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
        #swagger.security = [{
         "EncryptedAuthToken": []
        }]
        */
    return NVRService.getAllNvrs(req, res, next);
  }
  async getNVRsWithChannels(req, res, next) {
    /* #swagger.tags = ['NVR']
         #swagger.description = 'Retrieve all NVRs with their associated channels'
         #swagger.parameters['settingType'] = {
            in: 'query',
            description: 'Type of detection setting (e.g., countPersonsSettings, motionDetectionSettings, genericObjectDetectionSettings)',
            required: false,
            type: 'string',
            enum: ['countPersonsSettings', 'motionDetectionSettings', 'genericObjectDetectionSettings', 'countVehiclesSettings', 'loiteringWithoutAuthSettings', 'loiteringWithAuthSettings', 'unauthorizedAccessSettings', 'lineCrossingSettings', 'fireSmokeDetectionSettings', 'weaponDetectionSettings', 'unattendedBaggageDetectionSettings'],
            example: 'motionDetectionSettings'
            }
         #swagger.responses[200] = {
             description: 'List of NVRs with channels returned successfully'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return NVRService.getNVRsWithChannels(req, res, next);
  }
  async getNVRLocations(req, res, next) {
    /* #swagger.tags = ['NVR']
         #swagger.description = 'Retrieve locations of all NVRs'
         #swagger.responses[200] = {
             description: 'List of NVR locations returned successfully'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return NVRService.getNVRLocations(req, res, next);
  }
  async addNvr(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Add a new NVR to the system'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'NVR details to add',
           required: true,
           schema: { $ref: "#/definitions/addNVR" }
       }
       #swagger.responses[201] = {
           description: 'NVR added successfully'
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
    return NVRService.addNvr(req, res, next);
  }
  async deleteAllNvrs(req, res, next) {
    /* #swagger.tags = ['NVR']
       #swagger.description = 'Delete all NVRs and their associated cameras of an user'
       
       #swagger.responses[200] = {
           description: 'All NVRs and associated cameras deleted successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return NVRService.deleteAllNvrs(req, res, next);
  }
}

export default new NVRController();
