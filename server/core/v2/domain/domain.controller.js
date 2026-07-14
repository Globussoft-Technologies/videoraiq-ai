import DomainService from "./domain.service.js";

class DomainController {
  async registerDomain(req, res, next) {
    /* #swagger.tags = ['Domain']
    #swagger.description = 'Register a new domain'
    #swagger.parameters['data'] = {
          in: 'body',
          description: 'Domain name and ip to be pointed',
          required: true,
          schema: { $ref: "#/definitions/registerDomain" }
    }
    #swagger.responses[200] = {
        description: 'Domain request sent successfully',
    }
    #swagger.responses[400] = {
        description: 'Something went wrong with the request'
    }
    #swagger.responses[500] = {
        description: 'Internal server error'
    }
    
    */
    return DomainService.registerDomain(req, res, next);
  }
}
export default new DomainController();
