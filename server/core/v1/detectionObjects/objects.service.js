import DetectionObjects from "./objects.model.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { DETECTION_OBJECTS_TYPES_MAP } from "../../../constants/detectionTypes.js";

class ObjectsService {
  async createDetectionObjects(req, res, _next) {
    try {
      const { settingType, objects = [] } = req.body;

      const doc = await DetectionObjects.findOneAndUpdate(
        { settingType },
        {
          $addToSet: { objects: { $each: objects } },
          $setOnInsert: { settingType },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        }
      );
      return res.status(201).json(
        Response.userSuccessResp("Objects created successfully", {
          doc,
        })
      );
    } catch (error) {
      logger.error("Error creating objects:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to create objects", error?.message));
    }
  }

  async getAllObjects(_req, res, _next) {
    try {
      const docs = await DetectionObjects.find({})
        .select("-__v -createdAt -updatedAt")
        .sort({ settingType: 1 });
      const formattedDocs = docs.map((doc) => {
        return {
          settingType: doc.settingType,
          objects: doc.objects.sort(),
          name: DETECTION_OBJECTS_TYPES_MAP[doc.settingType] || doc.settingType,
        };
      });
      return res
        .status(200)
        .json(
          Response.userSuccessResp(
            "Detection objects retrieved successfully",
            formattedDocs
          )
        );
    } catch (error) {
      logger.error("Error fetching detection objects:", error);
      return res
        .status(400)
        .json(
          Response.errorResp(
            "Failed to retrieve detection objects",
            error?.message
          )
        );
    }
  }

  async deleteDetectionObjectsByType(req, res, next) {
    try {
      const { settingType, objects = [] } = req.body;

      if (!settingType || !Array.isArray(objects) || objects.length === 0) {
        return res.status(400).json({
          status: "fail",
          message: "settingType and non-empty objects array are required",
        });
      }

      const doc = await DetectionObjects.findOneAndUpdate(
        { settingType },
        {
          $pull: {
            objects: { $in: objects }, // remove matching objects
          },
        },
        {
          new: true,
        }
      );

      if (!doc) {
        return res.status(404).json({
          status: "fail",
          message: "Settings not found",
        });
      }

      return res
        .status(200)
        .json(Response.userSuccessResp("Objects removed successfully", doc));
    } catch (err) {
      next(err);
    }
  }
}

export default new ObjectsService();
