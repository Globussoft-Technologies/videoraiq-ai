import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import locationValidator from "./location.validation.js";
import locationModel from "./location.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import NVRModel from "../NVR/nvr.model.js";

class LocationService {
  async createLocation(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const adminId = data?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Admin context missing.", "Validation Failed!"));
      }

      const { locationName, empLocationId } = req.body;
      const { error } = locationValidator.createLocation(req.body);
      if (error) {
        return res.status(400).json(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      // Check for duplicate locationName (case-insensitive) for this admin
      if (locationName && locationName.trim() !== "") {
        const dupName = await locationModel.findOne({
          locationName: { $regex: `^${locationName.trim().toLowerCase()}$`, $options: "i" },
          adminId
        });
        if (dupName) {
          return res.status(409).json(Response.userFailResp("Location with this name already exists."));
        }
      }

      if (empLocationId && empLocationId.trim() !== "") {
        const existingLocation = await locationModel.findOne({ empLocationId, adminId });
        if (existingLocation) {
          return res.status(409).json(Response.userFailResp("Location with this employee location ID already exists."));
        }
      }

      const newLocation = await locationModel.create({
        locationName: locationName.trim().toLowerCase(),
        empLocationId,
        adminId
      });

      return res.status(201).json(Response.userSuccessResp("Location created successfully.", newLocation));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to create location in service.", error.message));
    }
  }

  async fetchLocations(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const adminId = data?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Admin context missing.", "Validation Failed!"));
      }

      const { skip = 0, limit = 10, search = '' } = req.query;
      const parsedSkip = parseInt(skip);
      const parsedLimit = parseInt(limit);

      const filter = { adminId };
      if (search && search.trim() !== "") {
        const regex = new RegExp(search.trim(), "i");
        filter.$or = [
          { locationName: regex },
          { empLocationId: regex }
        ];
      }

      const [locations, totalCount] = await Promise.all([
        locationModel.find(filter).skip(parsedSkip).limit(parsedLimit).sort({ createdAt: -1 }),
        locationModel.countDocuments(filter)
      ]);

      return res.status(200).json(Response.userSuccessResp("Locations fetched successfully.", {
        totalCount,
        locations
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch locations in service.", error.message));
    }
  }

  async getLocationById(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const adminId = data?.adminId;
      const { id } = req.query;
      if (!id) {
        return res.status(400).json(Response.userFailResp("Missing location id in query", "Validation Failed!"));
      }

      const location = await locationModel.findOne({ _id: id, adminId });
      if (!location) {
        return res.status(404).json(Response.userFailResp("Location not found."));
      }

      return res.status(200).json(Response.userSuccessResp("Location fetched successfully.", location));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch location by ID.", error.message));
    }
  }

  async updateLocation(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const adminId = data?.adminId;
      const { id } = req.query;
      const updateData = req.body;

      if (!id) {
        return res.status(400).json(Response.userFailResp("Missing location id in query", "Validation Failed!"));
      }

      const { error } = locationValidator.updateLocation(req.body);
      if (error) {
        return res.status(400).json(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      const existingLocation = await locationModel.findOne({ _id: id, adminId });
      if (!existingLocation) {
        return res.status(404).json(Response.userFailResp("Location not found."));
      }

      // Check for duplicate locationName (case-insensitive, not current id)
      if (updateData.locationName && updateData.locationName.trim() !== "") {
        updateData.locationName = updateData.locationName.trim().toLowerCase();
        const dupName = await locationModel.findOne({
          locationName: { $regex: `^${updateData.locationName}$`, $options: "i" },
          adminId,
          _id: { $ne: id }
        });
        if (dupName) {
          return res.status(409).json(Response.userFailResp("Another location with this name already exists."));
        }
      }

      if (updateData.empLocationId && updateData.empLocationId.trim() !== "") {
        const dupCheck = await locationModel.findOne({ empLocationId: updateData.empLocationId, adminId, _id: { $ne: id } });
        if (dupCheck) {
          return res.status(409).json(Response.userFailResp("Another location with this employee location ID already exists."));
        }
      }

      // Save old name for reference
      const oldLocationName = existingLocation.locationName;

      const updatedLocation = await locationModel.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true } // Return updated doc
      );

      // If locationName changed, update in authorizedUsers and NVRs
      if (updateData.locationName && updateData.locationName.trim() !== "" && updateData.locationName !== oldLocationName) {
        await Promise.all([
          authorizedUsersModel.updateMany(
            { adminId, location: { $regex: `^${oldLocationName}$`, $options: "i" } },
            { $set: { location: updateData.locationName } }
          ),
          // NVRModel.updateMany(
          //   { userId: data?.user_id?.toString(), location: { $regex: `^${oldLocationName}$`, $options: "i" } },
          //   { $set: { location: updateData.locationName } }
          // )
        ]);
      }

      return res.status(200).json(Response.userSuccessResp("Location updated successfully.", updatedLocation));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to update location.", error.message));
    }
  }

  async deleteLocation(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const adminId = data?.adminId;
      const { id } = req.query;
      if (!id) {
        return res.status(400).json(Response.userFailResp("Missing location id in query", "Validation Failed!"));
      }

      const deletedLocation = await locationModel.findOneAndDelete({ _id: id, adminId });
      if (!deletedLocation) {
        return res.status(404).json(Response.userFailResp("Location not found."));
      }

      // Check for 'Default' location
      let defaultLocation = await locationModel.findOne({ 
        adminId, 
        locationName: { $regex: /^default/i } 
      });

      if (!defaultLocation) {
        defaultLocation = await locationModel.create({
          locationName: "default",
          adminId
        });
      }

      // Reassign deleted location in both authorizedUsers and NVR collections
      if (defaultLocation) {
        const fallbackName = defaultLocation.locationName;
        const oldName = deletedLocation.locationName;

        if (oldName !== fallbackName) {
          await Promise.all([
            authorizedUsersModel.updateMany(
              { adminId, location: oldName },
              { $set: { location: fallbackName } }
            ),
            NVRModel.updateMany(
              { userId: data?.user_id?.toString(), location: oldName },
              { $set: { location: fallbackName } }
            )
          ]);
        }
      }

      return res.status(200).json(Response.userSuccessResp("Location deleted successfully.", deletedLocation));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to delete location.", error.message));
    }
  }

  async fetchEmployeeLocation(req, res, next) {
    try {
      const data = req?.verified?.userData;
      const adminId = data?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Admin context missing.", "Validation Failed!"));
      }

      const { skip = 0, limit = 10, search = '' } = req.query;
      const parsedSkip = parseInt(skip);
      const parsedLimit = parseInt(limit);

      //fetch all the unique location names from authorizedUsers collection
      const uniqueLocations = await authorizedUsersModel.distinct("location", { adminId });
      
      const validLocations = uniqueLocations.filter(loc => loc && loc.trim() !== "");
      if (validLocations.length === 0) {
        return res.status(200).json(Response.userSuccessResp("Locations fetched successfully.", {
          totalCount: 0,
          locations: []
        }));
      }

      const regexLocations = validLocations.map(loc => new RegExp(`^${loc}$`, "i"));
      const filter = { adminId };
      if (search && search.trim() !== "") {
        const regex = new RegExp(search.trim(), "i");
        filter.$or = [
          { locationName: regex },
          { empLocationId: regex }
        ];
      }

      //match the unique locations with the location names in location model
      
      const memberId = data?.memberId;
      
      const [locations, totalCount] = await Promise.all([
        locationModel.find(filter,{},{ memberId, user: "emp" }).skip(parsedSkip).limit(parsedLimit).sort({ createdAt: -1 }),
        locationModel.find(filter,{},{ memberId, user: "emp" })
      ]);

      return res.status(200).json(Response.userSuccessResp("Locations fetched successfully.", {
        totalCount:totalCount.length,
        locations
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch locations in service.", error.message));
    }
  }
}

export default new LocationService();
