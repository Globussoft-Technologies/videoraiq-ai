import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import locationValidator from "./location.validation.js";
import locationModel from "./location.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";
import NVRModel from "../NVR/nvr.model.js";

class LocationService {
  async syncLocationRenameInBackground({
    adminId,
    oldLocationName,
    newLocationName,
    userId = null,
  }) {
    if (!adminId || !oldLocationName || !newLocationName) return;

    const matchLocation = { $regex: `^${oldLocationName}$`, $options: "i" };
    const tasks = [
      authorizedUsersModel.updateMany(
        { adminId, location: matchLocation },
        { $set: { location: newLocationName } },
      ),
    ];

    if (userId) {
      tasks.push(
        NVRModel.updateMany(
          { userId: userId.toString(), location: matchLocation },
          { $set: { location: newLocationName } },
        ),
      );
    }

    const results = await Promise.allSettled(tasks);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          `Background location rename failed (${index}) for admin ${adminId}: ${result.reason?.message || result.reason}`,
        );
      }
    });
  }

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
        const normalizedLocationName = locationName.trim();
        const dupName = await locationModel.findOne({
          locationName: { $regex: `^${normalizedLocationName}$`, $options: "i" },
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
        locationName: locationName.trim(),
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
        updateData.locationName = updateData.locationName.trim();
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
      const nextLocationName =
        updateData.locationName && updateData.locationName.trim() !== ""
          ? updateData.locationName.trim()
          : null;

      const updatedLocation = await locationModel.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true } // Return updated doc
      );

      // If locationName changed, update in authorizedUsers and NVRs
      if (nextLocationName && nextLocationName !== oldLocationName) {
        setImmediate(() => {
          this.syncLocationRenameInBackground({
            adminId,
            oldLocationName,
            newLocationName: nextLocationName,
            userId: data?.user_id,
          }).catch((error) => {
            logger.error(
              `Background rename task crashed for admin ${adminId}: ${error.message}`,
            );
          });
        });
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
      const memberId = data?.memberId;

      const filter = { adminId };
      if (search && search.trim() !== "") {
        const regex = new RegExp(search.trim(), "i");
        filter.$or = [
          { locationName: regex },
          { empLocationId: regex }
        ];
      }

      // 1. Location-module docs (permission-gated via the { user: "emp" } find hook).
      // 2. Employee locations = distinct location names on authorizedUsers.
      const [moduleLocations, empLocationNames] = await Promise.all([
        locationModel.find(filter, {}, { memberId, user: "emp" }).sort({ createdAt: -1 }),
        authorizedUsersModel.distinct("location", { adminId })
      ]);

      // Member scoping: the find hook restricts module docs to the member's
      // employeeLocations, but the employee-name merge below bypasses it. Resolve
      // the same allowed set so both sources respect the restriction. null = no
      // restriction (no member, or no authorizedChannels doc → full access).
      let allowedEmpLocations = null;
      if (memberId) {
        const authorized = await authorizedChannelsModel.findOne({ userId: memberId });
        if (authorized) {
          allowedEmpLocations = new Set(
            (authorized.employeeLocations || []).map((l) => l?.trim().toLowerCase())
          );
        }
      }

      // Merge with NO duplicate locationName (case-insensitive) across either
      // source. Module docs win; then append each employee-location name only if
      // its lowercased name hasn't been seen yet. Apply the same search filter to
      // the employee-only names (module docs are already filtered).
      const seen = new Set();
      const merged = [];
      for (const doc of moduleLocations) {
        const key = doc.locationName?.trim().toLowerCase();
        if (!key || seen.has(key)) continue; // drop blank / duplicate module names
        seen.add(key);
        merged.push(doc);
      }

      const searchTrim = (search || "").trim().toLowerCase();
      for (const loc of empLocationNames) {
        const key = loc?.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        if (searchTrim && !key.includes(searchTrim)) continue;
        if (allowedEmpLocations && !allowedEmpLocations.has(key)) continue;
        seen.add(key);
        merged.push({ locationName: loc, source: "employee" });
      }

      const totalCount = merged.length;
      const locations = merged.slice(parsedSkip, parsedSkip + parsedLimit);

      return res.status(200).json(Response.userSuccessResp("Locations fetched successfully.", {
        totalCount,
        locations
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch locations in service.", error.message));
    }
  }
}

export default new LocationService();
