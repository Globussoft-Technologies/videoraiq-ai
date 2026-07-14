
import authorizedChannelsService from "./authorizedChannels.service.js";
class AuthorizedChannelsController{
    async fetchChannels(req,res,next){
    /* #swagger.tags = ['AuthorizedChannels']
    #swagger.description = 'Get all camera channels'
    #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/fetchAuthChannels' }
    }
    */
  return await authorizedChannelsService.fetchChannels(req, res, next);

    }

    async fetchLocations(req,res,next){
    /* #swagger.tags = ['AuthorizedChannels']
    #swagger.description = 'Get all camera locations'
      #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/fetchLocations' }
    }
    */
    return await authorizedChannelsService.fetchLocations(req, res, next);
    }

    async fetchDepartments(req,res,next){
    /* #swagger.tags = ['AuthorizedChannels']
    #swagger.description = 'Get all camera departments'
      #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/fetchAllDepartments' }
    }
    */
    return await authorizedChannelsService.fetchDepartments(req, res, next);
    }

    async fetchNVRS(req,res,next){
    /* #swagger.tags = ['AuthorizedChannels']
    #swagger.description = 'Get all camera departments'
      #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/fetchAllNVRS' }
    }
    */
    return await authorizedChannelsService.fetchNVRS(req,res,next);
    }

    async fetchChannelByNVRsOrDepartment(req,res,next){
      /* #swagger.tags = ['AuthorizedChannels']
    #swagger.description = 'Get all camera departments'
      #swagger.parameters['searchQuery'] = {
            in: 'query',
            description: 'search channel name',
            required: false,
            type: 'string',
      }
      #swagger.parameters['data'] = {
      in: 'body',
      description: 'Provide Filters',
      required: true,
      schema: { $ref: '#/definitions/fetchChannels' }
    }
    */
    return await authorizedChannelsService.fetchChannelByNVRsOrDepartment(req,res,next);

    }
}
export default new AuthorizedChannelsController();