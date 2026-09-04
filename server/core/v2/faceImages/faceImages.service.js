import mongoose from "mongoose";
import config from "config";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import faceImagesModel from "./faceImages.model.js";
import authorizedUsersModel from "../authorizedUsers/authorizedUsers.model.js";
import departmentsModel from "../departments/departments.model.js";
import shiftModel from "../shifts/shifts.model.js";
import FaceImagesValidator from "./faceImages.validate.js";
import { deleteMedia, mediaExists, putMedia, toRelativeMediaPaths } from "../../../utils/mediaStorage.js";
import dsUserSyncService, { friendlyDSMessage } from "../../../services/dsUserSync.service.js";
import OptimizedAccessLogs from "../accesslogs/newAccessLogs.model.js";

function escapeRegex(input = "") {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class FaceImagesService {
  // Links every FaceImages doc for a dsId to an authorizedUser and notifies DS.
  // Shared by tagFolder and quickCreateUser, which both perform the same link.
  async _tagFaceImages(dsId, authorizedUser, adminId, { notifyDS = true } = {}) {
    const tagTimestamp = new Date();
    const result = await faceImagesModel.updateMany(
      { dsId },
      { $set: { authorizedUserId: authorizedUser._id, adminId, tag: true, taggedAt: tagTimestamp } }
    );

    // Also mark this user's access logs as tagged — the Tagged Users page
    // (client_v2/src/pages/TaggedUsers) filters access logs on `tag: true`,
    // which is otherwise only set by the separate authorizedUsers "tag-user"
    // flow. Tagging a face here confirms the same identity, so it should
    // surface there too instead of being invisible to that page.
    await OptimizedAccessLogs.updateMany(
      { userId: authorizedUser._id, tag: { $ne: true } },
      { $set: { tag: true, taggedAt: tagTimestamp } }
    );

    // Fire-and-forget: notify DS of the tag without blocking or failing the caller's response.
    // quickCreateUser opts out — it already awaited the same call and must fail
    // the request (rather than silently log) when DS rejects the registration.
    if (notifyDS) {
      dsUserSyncService.syncUser(authorizedUser, dsId);
    }

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
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 40;
      const search = req.query.search?.trim();
      const { startDate, endDate } = req.query;

      const dateMatch = {};
      if (startDate) dateMatch.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) dateMatch.$lte = new Date(`${endDate}T23:59:59.999Z`);

      const pipeline = [
        ...(startDate || endDate ? [{ $match: { createdAt: dateMatch } }] : []),
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: "$dsId",
            authorizedUserId: { $first: "$authorizedUserId" },
            latestCreatedAt: { $max: "$createdAt" },
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
            latestCreatedAt: 1,
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
        ...(search ? [{
          $match: {
            $or: [
              { dsId: { $regex: escapeRegex(search), $options: "i" } },
              { "authorizedUser.name": { $regex: escapeRegex(search), $options: "i" } },
            ]
          }
        }] : []),
        { $sort: { latestCreatedAt: -1 } },
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

      return res.status(200).json(Response.userSuccessResp("Grouped images fetched successfully", {
        totalCount,
        skip,
        limit,
        groups,
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

  // Undo the side effects of a registration that ultimately failed, so a
  // retry doesn't orphan media on the NAS/bucket or leave DS holding a uid our
  // DB never stored. Best-effort: never throws over the original failure.
  async _rollbackFailedRegistration({ uploadedFiles = [], adminId, dsUid, userId } = {}) {
    await Promise.all(uploadedFiles.map((f) => deleteMedia(f).catch(() => {})));
    if (dsUid) {
      await dsUserSyncService.deleteUser(adminId, dsUid);
    }
    if (userId) {
      // Only reached when a step after create() blew up; leaving the row would
      // mean a user whose media and DS registration we just tore down.
      await authorizedUsersModel.findByIdAndDelete(userId).catch(() => {});
    }
  }

  async quickCreateUser(req, res, _next) {
    // Tracked outside the try so the catch can undo whatever already landed.
    let uploadedFiles = [];
    let dsRegisteredUid = null;
    let createdUserId = null;
    let adminId = null;

    try {
      adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in user data", "Validation Failed!"));
      }

      // Multipart sends every field as a string, and an untouched optional input
      // arrives as "", which Joi.number() rejects. Drop those so the numeric
      // fields stay genuinely optional for FormData callers.
      const body = { ...req.body };
      for (const key of ["orgId", "emp_id", "empRoleId", "locationId"]) {
        if (body[key] === "") delete body[key];
      }

      const { error, value } = FaceImagesValidator.quickCreateUser(body);
      if (error) {
        return res.send(Response.validationFailResp(error.message, "Validation Failed!"));
      }

      const {
        dsId, email: rawEmail, departmentId, designation, branch, shiftId, numberPlate, vehicleNumber,
        orgId, emp_id, empRoleId, permission, location, locationId,
        phoneNumber, address1, timezone, liveDemoData,
      } = value;
      const firstName = value.firstName.trim();
      const lastName = value.lastName.trim();

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
        department = await departmentsModel.findById(departmentId).select("_id departmentName");
        if (!department) {
          return res.send(Response.validationFailResp("Invalid DepartmentId, please provide valid departmentId", "Validation Failed!"));
        }
      }

      // Placeholder email required to satisfy the {adminId, email} unique index --
      // multiple quick-created users under the same admin can't all have email:null.
      const email = typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.trim() : undefined;
      const placeholderEmail = email ?? `quickcreate+${new mongoose.Types.ObjectId().toHexString()}@placeholder.local`;

      if (email) {
        const duplicateUser = await authorizedUsersModel.findOne({ adminId, email });
        if (duplicateUser) {
          return res.status(409).json(Response.userFailResp("Authorized user with email already exists"));
        }
      }

      // Same upload process as Register User: multipart buffers go straight to
      // putMedia (Oracle or SFTP, per config). Photos stay optional here --
      // without them the dsId's already-captured faces are the only face data.
      if (req.files?.length) {
        uploadedFiles = await Promise.all(
          req.files.map((file) =>
            putMedia({
              buffer: file.buffer,
              mediaType: "image",
              folderName: `${firstName}${lastName}`,
              originalName: file.originalname,
            })
          )
        );
      }

      // JSON callers may still pass already-stored media paths instead of files.
      const rawBodyPics = Array.isArray(value.profilePics)
        ? value.profilePics
        : (value.profilePics ? [value.profilePics] : []);
      const profilePics = [...uploadedFiles, ...(toRelativeMediaPaths(rawBodyPics) || [])];

      // DS is the gate: mint the _id up front so DS gets a uid to register
      // against, but write nothing to our DB until DS has accepted. A rejected
      // registration therefore leaves no half-created user behind.
      const newUserId = new mongoose.Types.ObjectId();
      const dsUser = {
        _id: newUserId,
        adminId,
        firstName,
        lastName,
        email: placeholderEmail,
        departmentId: department,
        branch: branch || "",
        designation: designation || "",
      };

      try {
        if (profilePics.length) {
          await dsUserSyncService.registerFaces(dsUser, profilePics);
          dsRegisteredUid = newUserId.toString();
        }
        // Always link the dsId folder, with or without uploaded photos.
        await dsUserSyncService.registerOnFly(dsUser, dsId);
      } catch (dsError) {
        logger.error(dsError);
        await this._rollbackFailedRegistration({ uploadedFiles, adminId, dsUid: dsRegisteredUid });

        const raw = dsError?.response?.data?.message || "";
        // A duplicate face is the caller's problem to resolve (409); anything
        // else is the face service being unhappy or unreachable (502).
        const status = /already registered/i.test(raw) ? 409 : 502;
        return res.status(status).json(
          Response.errorResp(friendlyDSMessage(dsError), "Authorized user was not created.")
        );
      }

      const newUser = await authorizedUsersModel.create({
        _id: newUserId,
        adminId,
        firstName,
        lastName,
        userName: `${firstName} ${lastName}`,
        email: placeholderEmail,
        // Only claim verified once DS actually enrolled a photo we sent; the
        // photo-less path still has nothing but on-the-fly camera captures.
        verified: profilePics.length > 0,
        departmentId: department?._id || null,
        shiftId: isShiftExist?._id || null,
        designation: designation || null,
        branch: branch || null,
        numberPlate: numberPlate || null,
        vehicleNumber: vehicleNumber || null,
        orgId: orgId ?? null,
        emp_id: emp_id ?? null,
        empRoleId: empRoleId ?? null,
        permission: permission || undefined,
        location: location || undefined,
        locationId: locationId ?? null,
        phoneNumber: phoneNumber || null,
        address1: address1 || null,
        timezone: timezone || null,
        profilePics,
        liveDemoData,
      });

      createdUserId = newUser._id;

      // DS was already told about this dsId above, and blockingly so -- don't
      // let _tagFaceImages fire the same call again.
      await this._tagFaceImages(dsId, newUser, adminId, { notifyDS: false });

      return res.status(201).json(Response.userSuccessResp("Authorized user created successfully", {
        ...newUser.toObject(),
        dsId,
      }));
    } catch (error) {
      logger.error(error);
      await this._rollbackFailedRegistration({
        uploadedFiles,
        adminId,
        dsUid: dsRegisteredUid,
        userId: createdUserId,
      });
      return res.status(500).json(Response.errorResp("Failed to create authorized user.", error.message));
    }
  }

  async deleteImages(req, res, _next) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      if (!adminId) {
        return res.status(400).json(Response.userFailResp("Missing adminId in user data", "Validation Failed!"));
      }

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
        dsUserSyncService.syncDeletedImages(adminId, dsId, imageUrls);
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

