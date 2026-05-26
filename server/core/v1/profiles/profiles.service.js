import logger from "../../../utils/logger.js";
import Profile from "./profiles.model.js";
import {
  createProfileValidator,
  editProfileValidator,
} from "./profiles.validate.js";
import Response from "../../../utils/response.js";
import { decryptData, encryptData } from "../../../utils/cryptoUtils.js";
import fs from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";
import { createJobsForNextDays } from "../jobs/utils/scheduleJobs.js";

class ProfilesServices {
  async getProfiles(req, res, _next) {
    try {
      const user = req?.verified?.userData?.adminId;
      const { skip = 0, limit = 10, name = "" } = req.query;

      const sortMapping = {
        name: "basics.profileName",
        createdBy: "createdBy",
        createdAt: "createdAt",
        lastModified: "updatedAt",
        status: "status",
      };

      const sortField = req.query.orderBy || "createdAt";
      const dbSortField = sortMapping[sortField] || sortField;
      const sortOrder = req.query.sort === "asc" ? 1 : -1;

      const sortBy = { [dbSortField]: sortOrder };
      // Build filter
      const filter = { user };
      if (name) {
        filter["basics.profileName"] = { $regex: name, $options: "i" };
      }
      // Query profiles
      const profiles = await Profile.find(filter)
        // .select("basics.profileName createdBy createdAt updatedAt status")
        .sort(sortBy)
        .collation({ locale: "en", strength: 2 }) 
        .populate("user")
        .populate("createdBy", "email")
        .skip(Number(skip))
        .limit(Number(limit))
        .lean();

      // Total count (without pagination)
      const total = await Profile.countDocuments(filter);

      return res.status(200).json(
        Response.userSuccessResp("Profiles retrieved successfully", {
          profiles,
          total,
        })
      );
    } catch (error) {
      logger.error("Error fetching profiles:", error);
      return res
        .status(400)
        .json(
          Response.errorResp("Failed to retrieve profiles", error?.message)
        );
    }
  }
  async addProfile(req, res, _next) {
    try {
      const payload = {
        ...req.body,
        createdBy: req?.verified?.userData?.memberId ? req?.verified?.userData?.memberId : req?.verified?.userData?.adminId,
        userType: req?.verified?.userData?.memberId ? "users" : "Admin",
        user: req?.verified?.userData?.adminId,
      };
      const { error, value } = createProfileValidator.validate(payload, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json({
          success: false,
          errors: error.details.map((err) => err.message),
        });
      }

      // Save to DB
      const profile = new Profile(value);
      await profile.save();

      // Schedule jobs for the new profile
      // await createJobsForNextDays(profile);

      return res.status(201).json(
        Response.userSuccessResp("Profile created successfully", {
          profile,
        })
      );
    } catch (error) {
      logger.error("Error adding profile:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to add profile", error?.message));
    }
  }
  async editProfile(req, res, _next) {
    try {
      const profileId = req.params.id;

      const payload = {
        ...req.body,
        user: req?.verified?.userData?.adminId,
      };
      // Validate incoming body
      const { error, value } = editProfileValidator.validate(payload, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json({
          success: false,
          errors: error.details.map((err) => err.message),
        });
      }

      // Update profile (only the provided fields)
      const updatedProfile = await Profile.findByIdAndUpdate(
        profileId,
        { $set: value },
        { new: true, runValidators: true }
      );

      if (!updatedProfile) {
        return res.status(400).json(Response.userFailResp("Profile not found"));
      }

      // Re-schedule jobs for the updated profile
      // await createJobsForNextDays(updatedProfile);

      return res.status(200).json(
        Response.userSuccessResp("Profile updated successfully", {
          profile: updatedProfile,
        })
      );
    } catch (error) {
      logger.error("Error editing profile:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to edit profile", error?.message));
    }
  }
  async deleteProfile(req, res, _next) {
    try {
      const { id } = req.params;
      const profile = await Profile.findByIdAndDelete(id);
      if (!profile) {
        return res.status(400).json(Response.userFailResp("Profile not found"));
      }

      return res
        .status(200)
        .json(Response.userSuccessResp("Profile deleted successfully"));
    } catch (error) {
      logger.error("Error deleting profile:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to delete profile", error?.message));
    }
  }
  async bulkDeleteProfiles(req, res, _next) {
    try {
      const { ids } = req.body; // Expecting an array of profile IDs
  
      if (!Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json(Response.errorResp("No profile IDs provided for deletion"));
      }
  
      // Delete all profiles matching the IDs
      const result = await Profile.deleteMany({ _id: { $in: ids } });
  
      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json(Response.notFoundResp("No profiles found to delete"));
      }
  
      return res.json(
        Response.userSuccessResp(`${result.deletedCount} profiles deleted successfully`)
      );
    } catch (error) {
      logger.error("Error bulk deleting profiles:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to bulk delete profiles", error.message));
    }
  }
  async getProfileById(req, res, _next) {
    try {
      const { id } = req.params;
      const profile = await Profile.findById(id);
      if (!profile) {
        return res.status(400).json(Response.userFailResp("Profile not found"));
      }

      return res.status(200).json(
        Response.userSuccessResp("Profile retrieved successfully", {
          profile,
        })
      );
    } catch (error) {
      logger.error("Error fetching profile:", error);
      return res
        .status(400)
        .json(Response.errorResp("Failed to retrieve profile", error?.message));
    }
  }
  async exportProfile(req, res, _next) {
    try {
      const { id } = req.params;

      const profile = await Profile.findOne({ _id: id }).lean();

      if (!profile) {
        return res.status(404).json(Response.notFoundResp("Profile not found"));
      }

      // Encrypt profile
      const encryptedContent = encryptData(profile);

      // Save as temp file
      const fileName = `profile_${id}.enc`;
      const filePath = path.join("/tmp", fileName);
      fs.writeFileSync(filePath, encryptedContent);

      res.download(filePath, fileName, (err) => {
        if (err) {
          logger.error("File download error:", err);
        }
        fs.unlinkSync(filePath); // cleanup temp file
      });
    } catch (error) {
      logger.error("Error exporting profile:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to export profile", error.message));
    }
  }
  async bulkExportProfiles(req, res, _next) {
    try {
      const { ids } = req.body; // Expecting an array of profile IDs
  
      if (!Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json(Response.errorResp("No profile IDs provided"));
      }
  
      const profiles = await Profile.find({ _id: { $in: ids } }).lean();
  
      if (!profiles.length) {
        return res.status(404).json(Response.notFoundResp("No profiles found"));
      }
  
      const tempDir = path.join("/tmp", `bulk_export_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
  
      // Encrypt and save each profile as a temp file
      profiles.forEach((profile) => {
        const encryptedContent = encryptData(profile);
        const fileName = `profile_${profile._id}.enc`;
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, encryptedContent);
      });
  
      // Create a zip archive
      const zipFileName = `profiles_export_${Date.now()}.zip`;
      const zipFilePath = path.join("/tmp", zipFileName);
      const output = fs.createWriteStream(zipFilePath);
      const archive = new ZipArchive({ zlib: { level: 9 } });
  
      output.on("close", () => {
        // Send the zip file for download
        res.download(zipFilePath, zipFileName, (err) => {
          if (err) {
            logger.error("Bulk export download error:", err);
          }
          // Cleanup temp files
          fs.rmSync(tempDir, { recursive: true, force: true });
          fs.unlinkSync(zipFilePath);
        });
      });
  
      archive.on("error", (err) => {
        throw err;
      });
  
      archive.pipe(output);
      archive.directory(tempDir, false);
      await archive.finalize();
    } catch (error) {
      logger.error("Error bulk exporting profiles:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to bulk export profiles", error.message));
    }
  }
  async importProfile(req, res, _next) {
    try {
      if (!req.file) {
        return res.status(400).json(Response.userFailResp("No file uploaded"));
      }

      const encryptedContent = fs.readFileSync(req.file.path, "utf8");
      fs.unlinkSync(req.file.path); // cleanup

      // Decrypt content
      const profileData = decryptData(encryptedContent);

      const payload = {
        user: req?.verified?.userData?.adminId,
        userType: req?.verified?.userData?.userType ?? "Admin",
        createdBy: req?.verified?.userData?.adminId,
        basics: profileData?.basics || {},
        notification: profileData?.notification || {},
        evidenceSeverity: profileData?.evidenceSeverity || {},
        defaultDetectionSettings: profileData?.defaultDetectionSettings || {},
      };

      const { error, value } = createProfileValidator.validate(payload, {
        abortEarly: false,
      });
      if (error) {
        return res.status(400).json({
          success: false,
          errors: error.details.map((err) => err.message),
        });
      }

      // Save to DB
      const profile = new Profile(value);
      await profile.save();

      return res.status(200).json(
        Response.userSuccessResp("Profile imported successfully", {
          profile,
        })
      );
    } catch (error) {
      logger.error("Error importing profile:", error);
      return res
        .status(500)
        .json(Response.errorResp("Failed to import profile", error.message));
    }
  }
}

export default new ProfilesServices();
