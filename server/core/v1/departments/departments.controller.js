import departmentsServices from "./departments.service.js";
class DepartmentController{
    async create(req,res,next){
        /*
        #swagger.tags = ['department']
        #swagger.description = 'This Api is user to create department'
        #swagger.parameters['data'] = {
            in: 'body',
            description: 'Provide Filters',
            required: true,
            schema: { $ref: '#/definitions/createDepartment' }
            
    }*/

        return  departmentsServices.create(req,res,next);
    }

    async get(req,res,next){
    /*
        #swagger.tags = ['department']
        #swagger.description = 'This Api is user to fetch departments'
        #swagger.parameters['data'] = {
            in: 'body',
            description: 'Provide Filters',
            required: true,
            schema: { $ref: '#/definitions/getDepartment' }
            
    }*/
    return departmentsServices.get(req,res,next);
    }

    async update(req,res,next){
        /*
        #swagger.tags = ['department']
        #swagger.description = 'This Api is user to update department'
        #swagger.parameters['departmentId'] = {
                            in: 'query',
                            required:true,
                            type:'string',
                            description: 'provide department _id to update',
        }
        #swagger.parameters['data'] = {
            in: 'body',
            description: 'Provide Filters',
            required: true,
            schema: { $ref: '#/definitions/updateDepartment' }
            
    }*/ 
    return departmentsServices.update(req,res,next);

    }

    async delete(req,res,next){
    /*
        #swagger.tags = ['department']
        #swagger.description = 'This Api is user to delete department'
        #swagger.parameters['departmentId'] = {
                            in: 'query',
                            required:true,
                            type:'string',
                            description: 'provide department _id to update',
        }
            
    }*/ 
    return departmentsServices.delete(req,res,next);

    }
}
export default new DepartmentController()