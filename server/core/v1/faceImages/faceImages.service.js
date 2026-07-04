import mongoose from "mongoose";
import config from "config";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import faceImagesModel from "./faceImages.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import departmentsModel from "../departments/departments.model.js";
import shiftModel from "../shifts/shifts.model.js";
import FaceImagesValidator from "./faceImages.validate.js";
import { deleteMedia, mediaExists } from "../../../utils/mediaStorage.js";
import dsUserSyncService from "../../../services/dsUserSync.service.js";

class FaceImagesService {
  // Links every FaceImages doc for a dsId to an authorizedUser and notifies DS.
  // Shared by tagFolder and quickCreateUser, which both perform the same link.
  async _tagFaceImages(dsId, authorizedUser, adminId) {
    const result = await faceImagesModel.updateMany(
      { dsId },
      { $set: { authorizedUserId: authorizedUser._id, adminId } }
    );

    // Fire-and-forget: notify DS of the tag without blocking or failing the caller's response.
    dsUserSyncService.syncUser(authorizedUser, dsId);

    return result;
  }

  async uploadImages(req, res, _next) {
    try {
      const { error } = FaceImagesValidator.uploadImages(req.body);
      if (error) {
        return res.send(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      const { dsId, images } = req.body;

      const docs = images.map((image) => ({ dsId, image, authorizedUserId: null }));
      const created = await faceImagesModel.insertMany(docs);

      return res.status(200).json(Response.userSuccessResp("Images uploaded successfully", {
        dsId,
        uploaded: created,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to upload images.", error.message));
    }
  }

  async getGroupedImages(req, res, _next) {
    try {
      const imageBaseUrl = config.get("ImageView");

      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 40;

      const pipeline = [
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: "$dsId",
            authorizedUserId: { $first: "$authorizedUserId" },
            images: { $push: { _id: "$_id", image: "$image" } },
          }
        },
        {
          $lookup: {
            from: "authorizedusers",
            localField: "authorizedUserId",
            foreignField: "_id",
            as: "authorizedUser",
          }
        },
        { $unwind: { path: "$authorizedUser", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            dsId: "$_id",
            authorizedUser: {
              $cond: [
                { $ifNull: ["$authorizedUser._id", false] },
                {
                  _id: "$authorizedUser._id",
                  name: {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ["$authorizedUser.firstName", ""] },
                          " ",
                          { $ifNull: ["$authorizedUser.lastName", ""] }
                        ]
                      }
                    }
                  }
                },
                null
              ]
            },
            images: 1,
          }
        },
        { $sort: { dsId: 1 } },
        {
          $facet: {
            metadata: [{ $count: "total" }],
            data: [{ $skip: skip }, { $limit: limit }],
          }
        },
      ];

      const results = await faceImagesModel.aggregate(pipeline);

      const totalCount = results[0]?.metadata[0]?.total || 0;
      const groups = results[0]?.data || [];

      const groupsWithFullImageUrls = groups.map((group) => ({
        ...group,
        images: group.images.map((img) => ({ ...img, image: `${imageBaseUrl}${img.image}` })),
      }));

      return res.status(200).json(Response.userSuccessResp("Grouped images fetched successfully", {
        totalCount,
        skip,
        limit,
        groups: groupsWithFullImageUrls,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to fetch grouped images.", error.message));
    }
  }

  async tagFolder(req, res, _next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in user data", "Validation Failed!"));
      }

      const { error } = FaceImagesValidator.tagFolder(req.body);
      if (error) {
        return res.send(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      const { dsId, authorizedUserId } = req.body;

      const existingCount = await faceImagesModel.countDocuments({ dsId });
      if (!existingCount) {
        return res.status(404).json(Response.notFoundResp("No images found for this dsId"));
      }

      const authUser = await authorizedUsersModel.findById(authorizedUserId).populate("departmentId", "departmentName");
      if (!authUser) {
        return res.status(404).json(Response.notFoundResp("Authorized user not found"));
      }

      await this._tagFaceImages(dsId, authUser, adminId);

      return res.status(200).json(Response.userSuccessResp("Folder tagged successfully", {
        dsId,
        authorizedUserId,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to tag folder.", error.message));
    }
  }

  async quickCreateUser(req, res, _next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in user data", "Validation Failed!"));
      }

      const { error } = FaceImagesValidator.quickCreateUser(req.body);
      if (error) {
        return res.send(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      const {
        dsId, email, departmentId, designation, branch, shiftId, numberPlate,
        orgId, emp_id, empRoleId, permission, location, locationId,
        phoneNumber, address1, timezone, profilePics,
      } = req.body;
      const firstName = req.body.firstName.trim();
      const lastName = req.body.lastName.trim();

      const existingCount = await faceImagesModel.countDocuments({ dsId });
      if (!existingCount) {
        return res.status(404).json(Response.notFoundResp("No images found for this dsId"));
      }

      // Same optional-field checks as the full Register User flow (createAuthUser).
      let isShiftExist = null;
      if (shiftId) {
        isShiftExist = await shiftModel.findById(shiftId);
        if (!isShiftExist) {
          return res.send(Response.validationFailResp("ShiftId does not Exist. Please provide valid ShiftId", "Validation Failed!"));
        }
      }

      let department = null;
      if (departmentId) {
        department = await departmentsModel.findById(departmentId).select("_id");
        if (!department) {
          return res.send(Response.validationFailResp("Invalid DepartmentId, please provide valid departmentId", "Validation Failed!"));
        }
      }

      // Placeholder email required to satisfy the {adminId, email} unique index —
      // multiple quick-created users under the same admin can't all have email:null.
      const placeholderEmail = email || `quickcreate+${new mongoose.Types.ObjectId().toHexString()}@placeholder.local`;

      if (email) {
        const duplicateUser = await authorizedUsersModel.findOne({ adminId, email });
        if (duplicateUser) {
          return res.status(409).json(Response.userFailResp("Authorized user with email already exists"));
        }
      }

      const newUser = await authorizedUsersModel.create({
        adminId,
        firstName,
        lastName,
        userName: `${firstName} ${lastName}`,
        email: placeholderEmail,
        verified: false,
        departmentId: department?._id || null,
        shiftId: isShiftExist?._id || null,
        designation: designation || null,
        branch: branch || null,
        numberPlate: numberPlate || null,
        orgId: orgId ?? null,
        emp_id: emp_id ?? null,
        empRoleId: empRoleId ?? null,
        permission: permission || undefined,
        location: location || undefined,
        locationId: locationId ?? null,
        phoneNumber: phoneNumber || null,
        address1: address1 || null,
        timezone: timezone || null,
        profilePics: profilePics || [],
      });

      await this._tagFaceImages(dsId, newUser, adminId);

      return res.status(201).json(Response.userSuccessResp("Authorized user created successfully", {
        ...newUser.toObject(),
        dsId,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to create authorized user.", error.message));
    }
  }

  async deleteImages(req, res, _next) {
    try {
      const { error } = FaceImagesValidator.deleteImages(req.body);
      if (error) {
        return res.send(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      const { imageIds } = req.body;

      const docs = await faceImagesModel.find({ _id: { $in: imageIds } });
      if (!docs.length) {
        return res.status(404).json(Response.notFoundResp("No matching images found"));
      }

      const errors = [];
      for (const doc of docs) {
        try {
          const exists = await mediaExists(doc.image);
          if (exists) {
            await deleteMedia(doc.image);
          }
        } catch (err) {
          logger.error(err);
          errors.push({ imageId: doc._id, image: doc.image, error: err.message });
        }
      }

      const result = await faceImagesModel.deleteMany({ _id: { $in: docs.map(d => d._id) } });

      // Fire-and-forget: notify DS of the deletion per dsId, without blocking or failing this response.
      const imageBaseUrl = config.get("ImageView");
      const docsByDsId = new Map();
      for (const doc of docs) {
        if (!docsByDsId.has(doc.dsId)) docsByDsId.set(doc.dsId, []);
        docsByDsId.get(doc.dsId).push(doc);
      }
      for (const [dsId, dsDocs] of docsByDsId) {
        const imageUrls = dsDocs.map((doc) => `${imageBaseUrl}${doc.image}`);
        dsUserSyncService.syncDeletedImages(dsDocs[0].adminId, dsId, imageUrls);
      }

      return res.status(200).json(Response.userSuccessResp("Images deleted successfully", {
        deletedCount: result.deletedCount,
        errors,
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).json(Response.errorResp("Failed to delete images.", error.message));
    }
  }
}

export default new FaceImagesService();
