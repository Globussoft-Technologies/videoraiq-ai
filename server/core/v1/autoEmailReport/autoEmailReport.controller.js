import autoEmailReportService from './autoEmailReport.services.js'

class createAutoEmailReport {
    async createAutoEmailReport(req, res, next){
        /* #swagger.tags = ['Auto_Email_Report']
                            #swagger.description = 'API to create report AutoEmailReport' */
        /*	#swagger.parameters['data'] = {
                                in: 'body',
                                description: 'Attendance Details',
                                required: true,
                                schema: { $ref: "#/definitions/autoEmailReportCreate" }
        } */
        return await autoEmailReportService.createAutoEmailReport(req, res, next);
    }
    async fetchReportDetails(req, res) {
        /* #swagger.tags = ['Auto_Email_Report']
                           #swagger.description = 'This route is used to Fetch Auto report Details'  */
        /*	#swagger.parameters['searchQuery'] = {
                              in: 'query',
                              description: 'Enter the searchQuery',
                              
        }*/

            /*	#swagger.parameters['orderBy'] = {
                            in: 'query',
                            description: 'keyword to be ordered',
                            enum: ['reportsTitle','frequency'],
    } */
        /*	#swagger.parameters['sort'] = {
                            in: 'query',
                            description: 'sorting parameters(asc or desc)',
                            enum: ['asc', 'desc'],
    } */
        /*	#swagger.parameters['skip'] = {
                            in: 'query',
                            type: 'integer',
                            minimum: 0,
                            description: 'Skip Values',
    } */

        /*	#swagger.parameters['limit'] = {
                            in: 'query',
                            type: 'integer',
                            minimum: 0,
                            description: 'results limit',
    } */
        return await autoEmailReportService.fetchReportDetails(req, res);
    }
    async updateReport(req, res, next) {
        /* 	#swagger.tags = ['Auto_Email_Report']
                        #swagger.description = 'This routes is used for update the report details ' */
     /*  #swagger.parameters['Id'] = {
                            in: 'query',
                            required: true,
                            description: 'Report Id',
                            }
    */
    /*	#swagger.parameters['data'] = {
                             in: 'body',
                             description: 'Company Details',
                             required: true,
                             schema: { $ref: "#/definitions/autoEmailReportCreate" }
    } */
        return await autoEmailReportService.updateReport(req, res, next);
    }
    async deleteReport(req, res, next) {
        /* 	#swagger.tags = ['Auto_Email_Report']
                        #swagger.description = 'This routes is used for delete the report ' */
     /*  #swagger.parameters['Id'] = {
                            in: 'query',
                            description: 'Report Id',
                            }
    */
     
        return await autoEmailReportService.deleteReport(req, res, next);
    }    

}
export default new createAutoEmailReport();