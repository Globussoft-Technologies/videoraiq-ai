import authorizedObjectsModel from "./authorizedObjects.model.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import adminModel from "../admin/admin.model.js";
class authorizedObjectsService {

    async createAuthorizedObjects(req,res,_next){
        try{
            const data = req?.verified?.userData;
            // Check if admin is valid
            const isAdminExist = await adminModel.findOne({
                user_id: data?.user_id?.toString(),
                email: data?.user_email,
            });
            let { objectType, objectNames } = req.body;
            if (!isAdminExist) {
                return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
            }

            // 🔍 Check if objectType already exists for this admin
            const existingRecord = await authorizedObjectsModel.findOne({
                admin: isAdminExist._id,
                objectType: objectType.trim(),
            });
        
            if (existingRecord) {
                // 🧠 Add only new unique objectNames
                const newNames = objectNames
                .map(name => name.trim())
                .filter(name => !existingRecord.objectNames.includes(name));
                if (newNames.length === 0) {
                return res.send(Response.userFailResp("All provided object names already exist!", "Duplicate Entry"));
                }
        
                existingRecord.objectNames.push(...newNames);
                await existingRecord.save();
        
                return res.send(Response.userSuccessResp("New object names added successfully", existingRecord));
            }
        
            // 🆕 Create new record if not existing
            const authorizedObj = await authorizedObjectsModel.create({
                admin: isAdminExist._id,
                objectType: objectType.trim(),
                objectNames: objectNames.map(name => name.trim()),
            });
        
            return res.send(Response.userSuccessResp("Authorized object created successfully", authorizedObj));

        }catch(err){
            return res.send(Response.userFailResp("Internal Server Error", err.message));
        }
    }

    async fetchAuthorizedObjects(req, res, _next) {
        try {
          const data = req?.verified?.userData;
          let { objectTypes } = req.body; // array of objectType strings
      
          if (!Array.isArray(objectTypes)) {
            return res.send(Response.userFailResp("objectTypes must be an array!", "Validation Failed"));
          }
      
          // Check if admin is valid
          const isAdminExist = await adminModel.findOne({
            user_id: data?.user_id?.toString(),
            email: data?.user_email,
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Build query: if objectTypes is empty, fetch all, else filter by objectTypes
          const query = { admin: isAdminExist._id };
          if (objectTypes.length > 0) {
            query.objectType = { $in: objectTypes.map(type => type.trim()) };
          }
      
          // Fetch authorized objects
          const records = await authorizedObjectsModel.find(query).select("objectNames -_id");
      
          // Flatten all objectNames into a single array
          const allObjectNames = records.reduce((acc, rec) => acc.concat(rec.objectNames), []);
      
          return res.send(Response.userSuccessResp("Authorized objects fetched successfully", allObjectNames));
      
        } catch (err) {
          return res.send(Response.userFailResp("Internal Server Error", err.message));
        }
      }

      async getAllObjectTypes(req, res, _next) {
        try {
          const data = req?.verified?.userData;
      
          // Check if admin is valid
          const isAdminExist = await adminModel.findOne({
            user_id: data?.user_id?.toString(),
            email: data?.user_email,
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Fetch all object types with their IDs
          const objectTypes = await authorizedObjectsModel.find(
            { admin: isAdminExist._id },
            { _id: 1, objectType: 1 }
          ).lean();
      
          return res.send(Response.userSuccessResp("Object types fetched successfully", objectTypes));
      
        } catch (err) {
          return res.send(Response.userFailResp("Internal Server Error", err.message));
        }
      }
      

      async updateAuthorizedObjects(req, res, _next) {
        try {
          const data = req?.verified?.userData;
          const { _id, objectType, objectNames } = req.body;
      
          // Validate admin
          const isAdminExist = await adminModel.findOne({
            user_id: data?.user_id?.toString(),
            email: data?.user_email,
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Find existing record
          const existingRecord = await authorizedObjectsModel.findOne({
            _id,
            admin: isAdminExist._id,
          });
      
          if (!existingRecord) {
            return res.send(Response.userFailResp("Authorized object not found!", "Not Found"));
          }
      
          // Update only provided properties
          if (objectType) existingRecord.objectType = objectType.trim();
          if (Array.isArray(objectNames) && objectNames.length > 0) {
            existingRecord.objectNames = objectNames.map(name => name.trim());
          }
      
          await existingRecord.save();
      
          return res.send(Response.userSuccessResp("Authorized object updated successfully", existingRecord));
      
        } catch (err) {
          return res.send(Response.userFailResp("Internal Server Error", err.message));
        }
      }

      async deleteAuthorizedObjects(req, res, _next) {
        try {
          const data = req?.verified?.userData;
          const { id } = req.query;
      
          // Validate admin
          const isAdminExist = await adminModel.findOne({
            user_id: data?.user_id?.toString(),
            email: data?.user_email,
          });
      
          if (!isAdminExist) {
            return res.send(Response.userFailResp("Admin not found!", "Validation Failed!"));
          }
      
          // Delete the authorized object
          const deletionResult = await authorizedObjectsModel.deleteOne({
            _id:id,
            admin: data?.adminId,
          });
      
          if (deletionResult.deletedCount === 0) {
            return res.send(Response.userFailResp("Authorized object not found or already deleted!", "Not Found"));
          }
      
          return res.send(Response.userSuccessResp("Authorized object deleted successfully", null));
      
        } catch (err) {
          return res.send(Response.userFailResp("Internal Server Error", err.message));
        }
      }
      
      
      

}

export default new authorizedObjectsService();