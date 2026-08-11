import departmentsModel from "./departments.model.js";
import Response from "../../../utils/response.js";
import createDepartment from "./departments.validate.js";
import logger from "../../../utils/logger.js";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
class DepartmentServices{
async create(req,res,next){
    try{
        const result = req.verified;
        let { orgId ,adminId, memberId } = result?.userData;
        orgId = orgId?.toString()
        const {departmentName,orgId:OrgId,empDepartmentId,isActive,softDelete,description,isImportedFromEMP} = req?.body;
        
        let {error,value} = createDepartment.createDepartment(req?.body);
        if(error) return res.send(Response.userFailResp(error,"Validation Failed!."));

        const departmentExists = await departmentsModel.findOne({ departmentName: new RegExp(`^${departmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') ,empDepartmentId})
        if (departmentExists) return res.send(Response.userFailResp('department already exists','Validation failed!.'));


        // ✅ Create new department
        const newDepartment = await departmentsModel.create({
            orgId,
            departmentName,
            description,
            empDepartmentId,
            isActive,
            isImportedFromEMP,
            softDelete,
            adminId
        });

        if (memberId) {
          await authorizedChannelsModel.updateOne(
            { adminId, userId: memberId },
            { $addToSet: { departmentIds: newDepartment._id } }
          );
        }
    
        return res.status(201).send(
            Response.userSuccessResp("Department created successfully.", newDepartment)
        );
        
        

    }catch(error){
        logger.error(error);
        return res.status(500).json(
        Response.errorResp("Failed to create department", error.message)
        );
    }
}

async get(req, res, next) {
  try {
    const result = req?.verified;
    const authorizedDepartments = req?.verified?.authorizedChannel?.departmentIds || [];

    let { orgId, adminId, memberId } = result?.userData || {};
    orgId = orgId?.toString();

    let { skip = 0, limit = 10, search = "" } = req.body;

    // ✅ Parse values properly
    skip = parseInt(skip, 10);
    limit = parseInt(limit, 10);

    if (isNaN(skip) || skip < 0) skip = 0;
    if (isNaN(limit) || limit < 1) limit = 10;

    // 🔍 Build filter
    let filter = {
      adminId,
    };

    if (search && search.trim() !== "") {
      filter.departmentName = { $regex: search.trim(), $options: "i" };
    }

    // 🧩 Restrict departments for member
    if (memberId) {
      if (authorizedDepartments.length > 0) {
        filter._id = { $in: authorizedDepartments };
      }
    }

    // 📊 Fetch data
    const departments = await departmentsModel
      .find(filter,{},{ memberId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // 📈 Total count
    const totalCount = await departmentsModel.find(filter,{},{ memberId });

    return res.status(200).send(
      Response.userSuccessResp("Departments fetched successfully", {
        totalCount: totalCount.length,
        skip,
        limit,
        hasMore: skip + departments.length < totalCount, // ✅ useful flag
        data: departments,
      })
    );

  } catch (error) {
    logger.error(error);
    return res
      .status(500)
      .json(Response.errorResp("Failed to fetch department", error.message));
  }
}


  async update(req, res, next) {
    try {
      const { departmentId } = req.query;
      if (!departmentId) {
        return res
          .status(400)
          .send(Response.userFailResp("Department ID is required", "Validation Failed!."));
      }
  
      // ✅ Validate request body
      let { error, value } = createDepartment.updateDepartment(req.body);
      if (error) {
        return res.send(
          Response.userFailResp(error, "Validation Failed!.")
        );
      }
  
      // ✅ Check if department exists
      const existingDepartment = await departmentsModel.findOne({
        _id: departmentId,
        softDelete: false,
      });
      if (!existingDepartment) {
        return res
          .status(404)
          .send(Response.userFailResp("Department not found", "Validation Failed!."));
      }
  
      // ✅ Prevent duplicate departmentName within the same org
      if (value.departmentName) {
        const escapedDept = String(value.departmentName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const duplicate = await departmentsModel.findOne({
          _id: { $ne: departmentId }, // exclude current one
          orgId: existingDepartment.orgId,
          departmentName: new RegExp(`^${escapedDept}$`, "i"),
          softDelete: false,
        });
        if (duplicate) {
          return res.send(
            Response.userFailResp("Department name already exists", "Validation Failed!.")
          );
        }
      }
  
      // ✅ Update department
      const updatedDepartment = await departmentsModel.findByIdAndUpdate(
        departmentId,
        { $set: value },
        { new: true }
      );
  
      return res.status(200).send(
        Response.userSuccessResp("Department updated successfully", updatedDepartment)
      );
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json(Response.userFailResp("Failed to update department", error.message));
    }
  }

  async delete(req, res, next) {
    try {
      const { departmentId } = req.query;

      if (!departmentId) {
        return res
          .status(400)
          .send(Response.userFailResp("Department ID is required", "Validation Failed!."));
      }

      // Check if department exists
      const department = await departmentsModel.findOne({
        _id: departmentId,
        softDelete: false,
      });

      if (!department) {
        return res
          .status(404)
          .send(Response.userFailResp("Department not found", "Validation Failed!."));
      }

      // Find or create default department for this org
      let defaultDept = await departmentsModel.findOne({
        adminId: department.adminId,
        departmentName: { $regex: /^default$/i },
      });
      if (!defaultDept) {
        defaultDept = await departmentsModel.create({
          orgId: department.orgId,
          departmentName: "default",
          description: "Default department",
          empDepartmentId: null,
          isActive: true,
          isImportedFromEMP: false,
          softDelete: false,
          adminId: department.adminId
        });
      }


      await Promise.all([
        authorizedChannelsModel.updateMany(
          { departmentIds: departmentId }, // match inside array
          { $set: { departmentIds: [defaultDept._id] } }
        ),
        authorizedUsersModel.updateMany(
          { departmentId },
            { $set: { departmentId: defaultDept._id } }
          )
      ]);

      // Hard delete department
      await departmentsModel.deleteOne({ _id: departmentId });

      return res
        .status(200)
        .send(Response.userSuccessResp("Department deleted successfully", department));
    } catch (error) {
      console.log(error);
      
      logger.error(error);
      return res
        .status(500)
        .json(Response.userFailResp("Failed to delete department", error.message));
    }
  }
  
  
  
    
}
export default new DepartmentServices()
