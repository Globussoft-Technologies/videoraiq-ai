import clientService from "./client.service.js";

class ClientController {
    async listAdmins(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'List all admins (from the platform, enriched with aMember): name, email, latest invoice name, expire date and status. Super-admin token required.' */
        /* #swagger.parameters['skip'] = { in: 'query', type: 'integer', minimum: 0, description: 'Records to skip' } */
        /* #swagger.parameters['limit'] = { in: 'query', type: 'integer', minimum: 1, description: 'Page size (max 50)' } */
        /* #swagger.parameters['search'] = { in: 'query', description: 'Filter by name / email / login' } */
        return await clientService.listAdmins(req, res, next);
    }

    async getClientCameras(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'List a client\'s added cameras (isAdded: true) with their NVR and per-detection enabled state. Super-admin token required.' */
        /* #swagger.parameters['adminId'] = { in: 'path', required: true, description: 'Client admin _id' } */
        return await clientService.getClientCameras(req, res, next);
    }
}

export default new ClientController();
