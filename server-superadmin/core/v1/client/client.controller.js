import clientService from "./client.service.js";

class ClientController {
    async listAdmins(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'List all admins (from the platform, enriched with aMember): name, email, latest invoice name, expire date and status. Super-admin token required.' */
        /* #swagger.parameters['skip'] = { in: 'query', type: 'integer', minimum: 0, description: 'Records to skip' } */
        /* #swagger.parameters['limit'] = { in: 'query', type: 'integer', minimum: 1, description: 'Page size (max 50)' } */
        /* #swagger.parameters['search'] = { in: 'query', description: 'Filter by name / email / login' } */
        /* #swagger.parameters['sortBy'] = { in: 'query', enum: ['name', 'email', 'login', 'createdAt'], description: 'Sort field (default createdAt)' } */
        /* #swagger.parameters['sortOrder'] = { in: 'query', enum: ['asc', 'desc'], description: 'Sort direction (default desc)' } */
        return await clientService.listAdmins(req, res, next);
    }

    async fleetOverview(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'Fleet Overview stats: header tiles (clients, active, cameras licensed/provisioned, detections running, alerts 24h), camera utilisation per client, clients by plan, detections by type, camera health. Super-admin token required.' */
        return await clientService.fleetOverview(req, res, next);
    }

    async topClientsByAlertVolume(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'Clients ranked by incident (alert) count in the window. Powers the Fleet Overview "Top Clients by Alert Volume" panel. Super-admin token required.' */
        /* #swagger.parameters['hours'] = { in: 'query', type: 'integer', description: 'Window in hours (default 24, max 720)' } */
        /* #swagger.parameters['limit'] = { in: 'query', type: 'integer', description: 'Number of clients (default 5, max 50)' } */
        return await clientService.topClientsByAlertVolume(req, res, next);
    }

    async alertsGraph(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'Fleet-wide hourly incident counts, zero-filled per UTC hour, oldest first. Powers the Fleet Overview "Alerts - last 24h" bar chart. Super-admin token required.' */
        /* #swagger.parameters['hours'] = { in: 'query', type: 'integer', description: 'Window in hours (default 24, max 168)' } */
        return await clientService.alertsGraph(req, res, next);
    }

    async getClientCameras(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'List a client\'s added cameras with a uniform grid of the admin\'s enabled detections and each camera\'s saved on/off boolean (ClientCameraDetection). Rows are lazily created (false) so new cameras auto-sync. Super-admin token required.' */
        /* #swagger.parameters['adminId'] = { in: 'path', required: true, description: 'Client admin _id' } */
        /* #swagger.parameters['search'] = { in: 'query', description: 'Filter cameras by name / customName' } */
        return await clientService.getClientCameras(req, res, next);
    }

    async updateCameraDetection(req, res, next) {
        /* #swagger.tags = ['Client'] */
        /* #swagger.description = 'Toggle one detection\'s enabled boolean for one camera (ClientCameraDetection). Super-admin token required.' */
        /* #swagger.parameters['adminId'] = { in: 'path', required: true, description: 'Client admin _id' } */
        /* #swagger.parameters['cameraId'] = { in: 'path', required: true, description: 'Camera (Channel) _id' } */
        /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { settingType: 'personalProtectiveEquipmentSettings', enabled: true } } */
        return await clientService.updateCameraDetection(req, res, next);
    }
}

export default new ClientController();
