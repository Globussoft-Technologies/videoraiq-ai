import plansService from "./plans.service.js";

class PlansController {
  async list(req, res, next) {
    /* #swagger.tags = ['Plans'] */
    /* #swagger.description = 'List the subscription plan catalog. Pass withCounts=true to include how many clients sit on each plan (resolved from aMember), includeArchived=true to include archived plans. Super-admin token required.' */
    return await plansService.list(req, res, next);
  }

  async create(req, res, next) {
    /* #swagger.tags = ['Plans']
    #swagger.description = 'Create a plan in the catalog. Display only - aMember still owns billing. Super-admin token required.'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Plan to create. Only name is required. features accepts an array or a comma separated string.',
        required: true,
        schema: { $ref: "#/definitions/createPlan" }
    }*/
    return await plansService.create(req, res, next);
  }

  async update(req, res, next) {
    /* #swagger.tags = ['Plans']
    #swagger.description = 'Update a plan. Only the fields present in the body are changed. Super-admin token required.'
    #swagger.parameters['data'] = {
        in: 'body',
        description: 'Fields to change. Any key omitted is left as-is.',
        required: true,
        schema: { $ref: "#/definitions/updatePlan" }
    }*/
    return await plansService.update(req, res, next);
  }

  async remove(req, res, next) {
    /* #swagger.tags = ['Plans'] */
    /* #swagger.description = 'Archive a plan (default) or remove it outright with hard=true. Super-admin token required.' */
    return await plansService.remove(req, res, next);
  }
}

export default new PlansController();
