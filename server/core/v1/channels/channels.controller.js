import ChannelService from "./channels.service.js";

class ChannelController {
  async updateChannel(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Update specific fields of a camera channel'
    #swagger.parameters['id'] = {
        in: 'path',
        description: 'Channel ID',
        required: true,
        type: 'string'
    }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/updateChannel" }
    }
    #swagger.responses[200] = {
        description: 'Channel updated successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.updateChannel(req, res, next);
  }

  async getAllChannels(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get all camera channels'
    #swagger.responses[200] = {
        description: 'List of all channels'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    #swagger.parameters['_id'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Channel ID (ObjectId) to filter a specific channel'
  }
  #swagger.parameters['nvrId'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'NVR ID (ObjectId) to filter channels'
  }
  #swagger.parameters['search'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Search by channel name (case-insensitive)'
  }
  #swagger.parameters['skip'] = {
    in: 'query',
    required: false,
    type: 'integer',
    description: 'Skip for pagination (default: 0)'
  }
  #swagger.parameters['limit'] = {
    in: 'query',
    required: false,
    type: 'integer',
    description: 'Number of results per page (default: 10)'
  }
    #swagger.parameters['location'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Location of camera'
  }
    #swagger.parameters['department'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Department ID (ObjectId) to filter a specific channel'
  }
    */
    return await ChannelService.getAllChannels(req, res, next);
  }

  async getNvrCameraDetections(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get running cameras grouped by NVR for a specific admin. Only cameras with at least one enabled detection and control=1 are returned.'
    #swagger.parameters['adminId'] = {
        in: 'path',
        description: 'Admin ID whose registered NVRs/cameras should be fetched',
        required: true,
        type: 'string',
        example: '66b1f0c9d5e4a123456789ab'
    }
    #swagger.responses[200] = {
        description: 'Grouped NVR camera detection data',
        schema: {
          status: 'success',
          message: 'NVR camera detections retrieved successfully',
          data: {
            totalNvrs: 2,
            nvrs: [
              {
                nvrId: '66b1f11ad5e4a123456789ac',
                nvrName: 'NVR-A',
                cameras: [
                  {
                    cameraId: '66b1f16bd5e4a123456789ad',
                    cameraName: 'Front Gate',
                    detections: ['Count Persons Detection']
                  },
                  {
                    cameraId: '66b1f18ed5e4a123456789ae',
                    cameraName: 'Lobby Custom',
                    detections: ['ANPR Detection']
                  }
                ]
              },
              {
                nvrId: '66b1f1a7d5e4a123456789af',
                nvrName: 'NVR-B',
                cameras: [
                  {
                    cameraId: '66b1f1c8d5e4a123456789b0',
                    cameraName: 'Warehouse',
                    detections: ['Crowd Detection', 'Light Detection']
                  }
                ]
              }
            ]
          }
        }
    }
    #swagger.responses[400] = {
        description: 'Missing required adminId',
        schema: {
          status: 'failed',
          message: 'Missing required adminId',
          error: 'Missing required adminId'
        }
    }
    #swagger.responses[404] = {
        description: 'Admin not found',
        schema: {
          status: 'failed',
          message: 'Admin not found'
        }
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.getNvrCameraDetections(req, res, next);
  }

  async getAllChannelsByNvrId(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get all camera channels by NVR ID (Frontend team should not use this API)'
    #swagger.parameters['nvrId'] = {
        in: 'path',
        description: 'NVR ID',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = {
        description: 'List of channels for given NVR'
    }
    #swagger.responses[400] = {
        description: 'Invalid NVR ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.getChannelsByNvr(req, res, next);
  }

  async deleteChannel(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Delete a camera channel'
    #swagger.parameters['id'] = {
        in: 'path',
        description: 'Channel ID',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = {
        description: 'Channel deleted successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.deleteChannel(req, res, next);
  }

  async bulkUpdateChannels(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Bulk update channels'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Array of channel IDs and fields to update',
        required: true,
        schema: { $ref: "#/definitions/bulkUpdateChannels" }
    }
    #swagger.responses[200] = {
        description: 'Channels updated successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.bulkUpdateChannels(req, res, next);
  }
  async updateChannelConfiguration(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Update configuration  of a camera'
    #swagger.parameters['id'] = {
                            in: 'query',
                            required:true,
                            type:'String',
                            description: 'channelId',
    }
    #swagger.parameters['detectionKey'] = {
                            in: 'query',
                            required:true,
                            type:'String',
                            description: 'detectionKey',
    }
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/updateChannelConfig" }
    }
    #swagger.responses[200] = {
        description: 'Channel updated successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.updateChannelConfiguration(req, res, next);
  }
  async getPlaybackUrl(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get playback URL for a channel'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Channel ID and date range for playback',
        required: true,
        schema: { $ref: "#/definitions/getPlayBackUrl" }
    }
    #swagger.responses[200] = {
        description: 'Playback URL retrieved successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.getPlaybackUrl(req, res, next);
  }
  async getPlaybackTimeline(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get playback timeline for a channel'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Channel ID and date range for playback',
        required: true,
        schema: { $ref: "#/definitions/getPlayBackTimeline" }
    }
    #swagger.responses[200] = {
        description: 'Playback URL retrieved successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.getPlaybackTimeline(req, res, next);
  }
  async getPlaybackWithFilters(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get playback with filters for a channel'
    #swagger.parameters['filter'] = {
            in: 'query',
            description: 'Field to sort',
            required: false,
            type: 'string',
            enum: ['locations', 'nvrs', 'departments', 'channels'],
            example: 'fullname'
    }
    #swagger.responses[200] = {
        description: 'Playback data retrieved successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.getPlaybackWithFilters(req, res, next);
  }
  async getFilterAllChannels(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get all camera channels'
    #swagger.responses[200] = {
        description: 'List of all channels'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    #swagger.parameters['_id'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Channel ID (ObjectId) to filter a specific channel'
  }
  #swagger.parameters['nvrId'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'NVR ID (ObjectId) to filter channels'
  }
  #swagger.parameters['search'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Search by channel name (case-insensitive)'
  }
    #swagger.parameters['location'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Location of camera'
  }
    #swagger.parameters['department'] = {
    in: 'query',
    required: false,
    type: 'string',
    description: 'Department ID (ObjectId) to filter a specific channel'
  }
    */
    return await ChannelService.getFilterAllChannels(req, res, next);
  }
  async getChannelById(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Get a specific channel by ID'
    #swagger.parameters['id'] = {
        in: 'path',
        description: 'Channel ID',
        required: true,
        type: 'string'
    }
    #swagger.responses[200] = {
        description: 'Channel retrieved successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid Channel ID'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
    "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.getChannelById(req, res, next);
  }
  async toggleDetection(req, res, next) {
    /* #swagger.tags = ['Channel']
    #swagger.description = 'Start detection for a channel'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to update',
        required: true,
        schema: { $ref: "#/definitions/startDetection" }
    }
    #swagger.responses[200] = {
        description: 'Detection toggled successfully'
    }
    #swagger.responses[400] = {
        description: 'Invalid input or missing data'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    #swagger.security = [{
        "EncryptedAuthToken": []
    }]
    */
    return await ChannelService.toggleDetection(req, res, next);
  }
}

export default new ChannelController();
