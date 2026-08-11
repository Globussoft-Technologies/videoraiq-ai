import DetectionSettingService from "./detectionSettings.service.js";
class DetectionSettingsController {
  async getDetectionTypes(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
       #swagger.description = 'Get available detection types'
       #swagger.responses[200] = {
           description: 'Detection types fetched successfully'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return DetectionSettingService.getDetectionTypes(req, res, next);
  }
  async createDetectionSettings(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
       #swagger.description = 'Create detection settings'
       #swagger.parameters['data'] = {
           in: 'body',
           description: 'Create detection details',
           required: true,
           schema: { $ref: "#/definitions/createDetectionSettings" }
       }
       #swagger.responses[201] = {
           description: 'Detection settings successfully'
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
    return DetectionSettingService.createDetectionSettings(req, res, next);
  }
  async deleteDetectionSettings(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
       #swagger.description = 'Delete detection settings'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'ID of the detection setting to delete',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Detection settings deleted successfully'
       }
       #swagger.responses[404] = {
           description: 'Detection settings not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return DetectionSettingService.deleteDetectionSettings(req, res, next);
  }
  async updateDetectionSettings(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
       #swagger.description = 'Update detection settings'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'ID of the detection setting to update',
           required: true,
           type: 'string'
       }
        #swagger.parameters['data'] = {
           in: 'body',
           description: 'Updated detection settings data',
           required: true,
           schema: { $ref: "#/definitions/updateDetectionSettings" }
       }
       #swagger.responses[200] = {
           description: 'Detection settings updated successfully'
       }
       #swagger.responses[400] = {
           description: 'Validation error or missing required fields'
       }
       #swagger.responses[404] = {
           description: 'Detection settings not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return DetectionSettingService.updateDetectionSettings(req, res, next);
  }

  async getDetectionSettings(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
       #swagger.description = 'Get detection settings by ID'
       #swagger.parameters['id'] = {
           in: 'path',
           description: 'ID of the detection setting to retrieve',
           required: true,
           type: 'string'
       }
       #swagger.responses[200] = {
           description: 'Detection settings retrieved successfully'
       }
       #swagger.responses[404] = {
           description: 'Detection settings not found'
       }
       #swagger.responses[500] = {
           description: 'Internal server error'
       }
        #swagger.security = [{
         "EncryptedAuthToken": []
      }]
    */
    return DetectionSettingService.getDetectionSettings(req, res, next);
  }
  async getAllDetectionSettings(req, res, next) {
    /* 
        #swagger.tags = ['Detection Settings']
        #swagger.description = 'Get all detection settings for the authenticated user. Supports filtering by IDs, name, setting type, and pagination.'
        #swagger.parameters['ids'] = {
            in: 'query',
            description: 'Comma-separated list of detection setting IDs to fetch',
            required: false,
            type: 'string',
            example: '64a1f0c8d8e4d2a1b3c7a123,64a1f0c8d8e4d2a1b3c7a456'
        }
        #swagger.parameters['nvrIds'] = {
            in: 'query',
            description: 'Comma-separated list of NVR IDs to fetch',
            required: false,
            type: 'string',
            example: '64a1f0c8d8e4d2a1b3c7a123,64a1f0c8d8e4d2a1b3c7a456'
        }
        #swagger.parameters['channelIds'] = {
            in: 'query',
            description: 'Comma-separated list of channel IDs to fetch',
            required: false,
            type: 'string',
            example: '64a1f0c8d8e4d2a1b3c7a123,64a1f0c8d8e4d2a1b3c7a456'
        }
        #swagger.parameters['name'] = {
            in: 'query',
            description: 'Partial or full name of the detection setting to search',
            required: false,
            type: 'string',
            example: 'entry gate'
        }
        #swagger.parameters['settingType'] = {
            in: 'query',
            description: 'Type of detection setting (e.g., countPersonsSettings, motionDetectionSettings, genericObjectDetectionSettings)',
            required: false,
            type: 'string',
            enum: ['countPersonsSettings', 'motionDetectionSettings', 'genericObjectDetectionSettings', 'countVehiclesSettings', 'loiteringWithoutAuthSettings', 'loiteringWithAuthSettings', 'unauthorizedAccessSettings', 'lineCrossingSettings', 'fireSmokeDetectionSettings', 'weaponDetectionSettings', 'unattendedBaggageDetectionSettings', 'conveyorDetectionSettings', 'crusherDetectionSettings'],
            example: 'motionDetectionSettings'
        }
        #swagger.parameters['skip'] = {
            in: 'query',
            description: 'Number of records to skip (for pagination)',
            required: false,
            type: 'integer',
            example: 0
        }
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Maximum number of records to return',
            required: false,
            type: 'integer',
            example: 10
        }
        #swagger.responses[200] = {
            description: 'Detection settings retrieved successfully',
            schema: {
            success: true,
            message: "Detection settings fetched successfully",
            }
        }
        #swagger.responses[500] = {
            description: 'Internal server error'
        }
        #swagger.security = [{
            "EncryptedAuthToken": []
        }]
    */
    return DetectionSettingService.getAllDetectionSettings(req, res, next);
  }
  async getDetectionExamples(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
         #swagger.description = 'Get detection settings examples'
         #swagger.responses[200] = {
             description: 'Detection examples fetched successfully'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return DetectionSettingService.getDetectionExamples(req, res, next);
  }
  async attachDetectionSetting(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
         #swagger.description = 'Attach detection setting to a channel'
         #swagger.parameters['data'] = {
           in: 'body',
           description: 'Attach detection settings',
           required: true,
           schema: { $ref: "#/definitions/settingsAttach" }
        }
         #swagger.responses[200] = {
             description: 'Detection setting attached successfully'
         }
         #swagger.responses[404] = {
             description: 'Channel or detection setting not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return DetectionSettingService.attachDetectionSetting(req, res, next);
  }
  async detachDetectionSetting(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
         #swagger.description = 'Detach detection setting from a channel'
         #swagger.parameters['data'] = {
           in: 'body',
           description: 'Detach detection settings',
           required: true,
           schema: { $ref: "#/definitions/settingsDetach" }
        }
         #swagger.responses[200] = {
             description: 'Detection setting detached successfully'
         }
         #swagger.responses[404] = {
             description: 'Channel or detection setting not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
    */
    return DetectionSettingService.detachDetectionSetting(req, res, next);
  }

  async resetDetectionThresholds(req, res, next) {
    /* #swagger.tags = ['Detection Settings']
         #swagger.description = 'Reset saved detection thresholds for one detection setting'
         #swagger.parameters['id'] = {
           in: 'path',
           description: 'ID of the detection setting to reset',
           required: true,
           type: 'string'
         }
         #swagger.responses[200] = {
             description: 'Detection thresholds reset successfully'
         }
         #swagger.responses[404] = {
             description: 'Detection setting not found'
         }
         #swagger.responses[500] = {
             description: 'Internal server error'
         }
            #swagger.security = [{
             "EncryptedAuthToken": []
        }]
        */
    return DetectionSettingService.resetDetectionThresholds(req, res, next);
  }
}

export default new DetectionSettingsController();
