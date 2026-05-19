import crypto from "crypto";
import { google } from "googleapis";
import { redis } from "../../../utils/database.js";
import Storage from "./storage.model.js";
import { decryptJSON, encryptJSON } from "../../../utils/cryptoUtils.js";
import {
  googleDriveBodySchema,
  s3Validator,
  sftpValidator,
} from "./storage.validator.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import config from "config";
import stream from "stream";
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import Client from "ssh2-sftp-client";
const storagePage = config.get("Frontend.storagePage");
import filesModel from "../files/files.model.js";
import path from "path";
import { randomUUID } from "crypto";
import mime from "mime-types";
import { getManualMimeType } from "../Uploads/uploads.service.js";
import { pipeline } from "stream/promises";
import fs from "fs";
import { decode } from "js-base64";
import { connectSFTP } from "../../../utils/newSFTPConnectionCheck.js";

const sftpPool = new Map();
const SFTP_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of idle connections
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sftpPool.entries()) {
    if (
      session.activeRequests === 0 &&
      now - session.lastUsed > SFTP_IDLE_TIMEOUT
    ) {
      session.client
        .end()
        .catch((e) => logger.debug("Error closing idle SFTP:", e));
      sftpPool.delete(id);
    }
  }
}, 60000).unref();

const safeTempFileDelete = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return;
  const uploadDir = path.resolve('uploads');
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath.startsWith(uploadDir)) {
    fs.unlink(filePath, (err) => {
      if (err) logger.debug("Failed to delete temp file:", err);
    });
  }
};

class StorageService {
  async addStorage(req, res, next) {
    try {
      const { storageType } = req.body;

      if (!storageType) {
        return res
          .status(400)
          .json(
            Response.userFailResp(
              "Validation Failed",
              "Storage type is required"
            )
          );
      }

      switch (storageType.toLowerCase()) {
        case "s3":
          return await this.handleS3Storage(req, res, next);
        case "google_drive_oauth":
          return await this.googleAuthUrl(req, res, next); // OAuth flow
        case "google_drive_service_account":
          return await this.addGoogleDriveServiceAccount(req, res, next);
        case "sftp":
          return await this.handleSFTPStorage(req, res, next);
        default:
          return res
            .status(404)
            .send(
              Response.userFailResp(
                "Invalid storage type",
                "Invalid storage type"
              )
            );
      }
    } catch (err) {
      logger.error("Error in addStorage:", err);
      return res
        .status(500)
        .send(Response.userFailResp("Error adding storage", err.message));
    }
  }

  async handleS3Storage(req, res, _next) {
    try {
      const { error, value } = s3Validator.validate(req.body);
      if (error) {
        return res
          .status(404)
          .send(Response.userFailResp("Validation error", error.message));
      }
      const userId = req?.verified?.userData?.adminId;
      const { accessKeyId, secretAccessKey, bucketName, region, name, note } =
        value;

      const decodedSecretKey = decode(secretAccessKey);
      const s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey: decodedSecretKey },
      });

      // Step 1: Check bucket list access
      await s3.send(
        new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 })
      );

      // Step 2: Check put access with a test object
      const testKey = `__connection_test_${Date.now()}.txt`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: testKey,
          Body: "S3 connection test",
        })
      );

      // Step 3: Cleanup test file
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: testKey,
        })
      );

      // Here you would save tokens to DB instead of file
      const toStore = {
        accessKeyId,
        secretAccessKey: decodedSecretKey,
        bucketName,
        region,
      };

      // Save to DB
      const isUpdate = req?.updateId;
      if (isUpdate) {
        const storage = await Storage.findOneAndUpdate(
          { _id: isUpdate, userId },
          {
            name,
            type: "s3",
            credentials: encryptJSON(JSON.stringify(toStore)),
            note,
          },
          { new: true }
        );

        if (!storage) {
          return res
            .status(404)
            .send(Response.userFailResp("Storage not found for update"));
        }
      } else {
        const storage = new Storage({
          userId,
          name,
          type: "s3",
          credentials: encryptJSON(JSON.stringify(toStore)),
          note,
        });
        await storage.save();
      }

      return res
        .status(200)
        .send(
          Response.userSuccessResp("S3 connection and permissions verified")
        );
    } catch (err) {
      logger.error("Invalid S3 credentials or bucket access denied:", err);
      return res
        .status(400)
        .send(
          Response.userFailResp(
            "Invalid S3 credentials or missing permissions (list/put)"
          )
        );
    }
  }

  async addGoogleDriveServiceAccount(req, res) {
    try {
      const userId = req?.verified?.userData?.adminId;
      const { name } = req.body;
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse uploaded JSON
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(req.file.buffer.toString("utf8"));
      } catch (err) {
        return res.status(400).json({ message: "Invalid JSON file" });
      }

      // Auth with service account
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });

      const drive = google.drive({ version: "v3", auth });

      // Test upload a small file
      const fileMetadata = { name: `service-account-test-${Date.now()}.txt` };
      const media = { mimeType: "text/plain", body: "Google Drive SA test" };

      const file = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: "id",
        supportsAllDrives: true, // Support shared drives
      });

      // Delete the test file
      await drive.files.delete({ fileId: file.data.id });

      // Save encrypted credentials in DB
      const storage = new Storage({
        userId,
        name,
        type: "google_drive_service_account",
        credentials: encryptJSON(JSON.stringify(serviceAccount)),
      });
      await storage.save();

      return res
        .status(200)
        .json({ message: "Service account verified and saved" });
    } catch (err) {
      logger.error(err);
      return res
        .status(500)
        .json({ message: "Error verifying service account" });
    }
  }

  async googleAuthUrl(req, res, _next) {
    try {
      const user_id = req?.verified?.userData?.adminId;

      const { error, value } = googleDriveBodySchema.validate(req.body);
      if (error) {
        return res
          .status(404)
          .send(Response.userFailResp("Validation error", error.message));
      }
      const { clientId, clientSecret, redirectUri, name, note } = value;

      // Generate a unique key for this auth flow
      const sessionId = crypto.randomUUID();

      // Store temp creds in Redis with TTL (e.g., 5 mins)
      await redis.hset(`google_oauth:${sessionId}`, {
        clientId,
        clientSecret,
        redirectUri,
        userId: user_id,
        name,
        updateId: req?.updateId || "", // Pass updateId if available
        note: note || "",
      });
      await redis.expire(`google_oauth:${sessionId}`, 300); // 5 min TTL

      const oAuth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent", // ensures refresh_token is returned
        scope: ["https://www.googleapis.com/auth/drive.file"],
        state: sessionId,
      });
      return res
        .status(200)
        .send(
          Response.userSuccessResp(
            "Google Drive authentication URL generated",
            { url: authUrl }
          )
        );
    } catch (error) {
      logger.error("Error generating Google auth URL:", error);
      return res
        .status(500)
        .send(
          Response.userFailResp(
            "Error generating Google auth URL",
            error.message
          )
        );
    }
  }

  async googleAuthCallback(req, res, _next) {
    try {
      const { code, state: sessionId } = req.query;
      const oauthData = await redis.hgetall(`google_oauth:${sessionId}`);

      if (!oauthData) {
        return res.status(400).json({ error: "Invalid or expired session" });
      }

      const { clientId, clientSecret, redirectUri, name, userId, note } =
        oauthData;

      const oAuth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      const { tokens } = await oAuth2Client.getToken(code);

      // Here you would save tokens to DB instead of file
      const toStore = {
        clientId,
        clientSecret,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      };

      // Save to DB
      const isUpdate = oauthData?.updateId;
      if (isUpdate) {
        const storage = await Storage.findOneAndUpdate(
          { _id: isUpdate, userId },
          {
            name,
            type: "google_drive_oauth",
            credentials: encryptJSON(JSON.stringify(toStore)),
            note,
          },
          { new: true }
        );

        if (!storage) {
          return res
            .status(404)
            .send(Response.userFailResp("Storage not found for update"));
        }
      } else {
        const storage = new Storage({
          userId,
          name,
          type: "google_drive_oauth",
          credentials: encryptJSON(JSON.stringify(toStore)),
          note,
        });
        await storage.save();
      }

      // Remove from Redis after use
      await redis.del(`google_oauth:${sessionId}`);

      return res.redirect(storagePage);
    } catch (err) {
      logger.error("OAuth callback error:", err.message);
      return res
        .status(500)
        .send(Response.userFailResp("OAuth callback error:", err.message));
    }
  }
  async handleSFTPStorage(req, res, _next) {
    try {
      const userId = req?.verified?.userData?.adminId;

      const { error, value } = sftpValidator.validate(req.body);
      if (error) {
        return res
          .status(404)
          .send(Response.userFailResp("Validation error", error.message));
      }
      const { host, port, username, password, name, path, note } = value;

      const sftp = new Client();

      const decodedPassword = decode(password);
      // Try connecting
      await sftp.connect({
        host,
        port,
        username,
        password: decodedPassword,
      });

      // Perform a round-trip test
      const testFolder = path;
      const testFileName = `sftp_dummy_${Date.now()}.txt`;
      const testFilePath = `${testFolder}/${testFileName}`;

      try {
        // Make sure test folder exists, if not skip (don’t throw error for missing folder)
        const folderExists = await sftp.exists(testFolder);
        if (!folderExists) {
          return res
            .status(400)
            .send(
              Response.userFailResp(
                `Test folder ${testFolder} does not exist`,
                err.message
              )
            );
        }

        // Upload dummy file
        await sftp.put(Buffer.from("SFTP connection test"), testFilePath);

        // Delete dummy file
        await sftp.delete(testFilePath);
      } catch (err) {
        logger.error("SFTP file operations failed:", err.message);
        return res
          .status(400)
          .send(
            Response.userFailResp(
              `SFTP connection succeeded but file operations failed`,
              err.message
            )
          );
      } finally {
        await sftp.end();
      }

      // Save to DB
      const isUpdate = req?.updateId;
      if (isUpdate) {
        // Invalidate existing pool session if updating storage
        if (sftpPool.has(isUpdate.toString())) {
          const s = sftpPool.get(isUpdate.toString());
          s.client.end().catch(() => {});
          sftpPool.delete(isUpdate.toString());
        }

        const storage = await Storage.findOneAndUpdate(
          { _id: isUpdate, userId },
          {
            name,
            type: "sftp",
            credentials: encryptJSON(
              JSON.stringify({
                host,
                port,
                username,
                password: decodedPassword,
                path,
              })
            ),
            note,
          },
          { new: true }
        );

        if (!storage) {
          return res
            .status(404)
            .send(Response.userFailResp("Storage not found for update"));
        }
      } else {
        const storage = new Storage({
          userId,
          type: "sftp",
          credentials: encryptJSON(
            JSON.stringify({
              host,
              port,
              username,
              password: decodedPassword,
              path,
            })
          ),
          name,
          note,
        });
        await storage.save();
      }

      return res
        .status(200)
        .send(Response.userSuccessResp("SFTP storage added successfully"));
    } catch (error) {
      logger.error("Error adding SFTP storage:", error.message);
      return res
        .status(500)
        .send(
          Response.userFailResp("Failed to add SFTP storage", error.message)
        );
    }
  }
  async getStorages(req, res, _next) {
    try {
      const userId = req?.verified?.userData?.adminId;
      const { skip = 0, limit = 10, name = "" } = req.query;

      const sortMapping = {
        name: "name",
        type: "type",
        createdAt: "createdAt",
        status: "active",
        note: "note",
      };

      const sortField = req.query.sortField || "createdAt";
      const dbSortField = sortMapping[sortField] || sortField;
      const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

      const sortBy = { [dbSortField]: sortOrder };
      const filter = { userId };

      if (name) {
        filter.name = { $regex: name, $options: "i" };
      }

      const storages = await Storage.find(filter)
        .select("-credentials")
        .sort(sortBy)
        .skip(Number(skip))
        .limit(Number(limit));

      const total = await Storage.countDocuments(filter);

      return res.status(200).send(
        Response.userSuccessResp("Storages retrieved successfully", {
          storages,
          total,
        })
      );
    } catch (err) {
      logger.error("Error retrieving storages:", err);
      return res
        .status(500)
        .send(Response.userFailResp("Error retrieving storages", err.message));
    }
  }
  async deleteStorage(req, res, _next) {
    try {
      const userId = req?.verified?.userData?.adminId;
      const storageId = req.params.id;

      // Validate storage ID
      if (!storageId) {
        return res
          .status(400)
          .send(Response.userFailResp("Storage ID is required"));
      }

      // Find and delete the storage
      const deletedStorage = await Storage.findOneAndDelete({
        _id: storageId,
        userId,
        active: false, // Only allow deletion if not active
      });

      if (!deletedStorage) {
        return res
          .status(400)
          .send(Response.userFailResp("Cannot delete active storage"));
      }

      return res
        .status(200)
        .send(Response.userSuccessResp("Storage deleted successfully"));
    } catch (err) {
      logger.error("Error deleting storage:", err);
      return res
        .status(500)
        .send(Response.userFailResp("Error deleting storage", err.message));
    }
  }

  async activateStorage(req, res, _next) {
    try {
      const userId = req?.verified?.userData?.adminId;
      const storageId = req?.body?.storageId;
      const activate = req?.body?.activate; // boolean: true = activate, false = deactivate

      if (!storageId || typeof activate !== "boolean") {
        return res
          .status(400)
          .send(
            Response.userFailResp(
              "Storage ID and valid 'activate' flag are required"
            )
          );
      }

      const storages = await Storage.find({ userId });
      if (!storages.length) {
        return res
          .status(404)
          .send(Response.userFailResp("No storages found for this user"));
      }

      const targetStorage = storages.find(
        (s) => s._id.toString() === storageId
      );
      if (!targetStorage) {
        return res.status(404).send(Response.userFailResp("Storage not found"));
      }

      if (activate) {
        // Rule 1: only one active → deactivate all others, activate this one
        await Storage.updateMany({ userId }, { active: false });
        await Storage.findByIdAndUpdate(storageId, { active: true });
        return res
          .status(200)
          .send(Response.userSuccessResp("Storage activated successfully"));
      } else {
        // Rule 3: at least one active storage must remain
        const activeCount = storages.filter((s) => s.active).length;
        if (activeCount <= 1 && targetStorage.active) {
          return res
            .status(400)
            .send(
              Response.userFailResp("Cannot deactivate the only active storage")
            );
        }
        await Storage.findByIdAndUpdate(storageId, { active: false });
        return res
          .status(200)
          .send(Response.userSuccessResp("Storage deactivated successfully"));
      }
    } catch (err) {
      logger.error("Error updating storage activation:", err);
      return res
        .status(500)
        .send(
          Response.userFailResp(
            "Error updating storage activation",
            err.message
          )
        );
    }
  }

  async updateStorage(req, res, _next) {
    try {
      const storageId = req.params.id;
      const userId = req?.verified?.userData?.adminId;

      // Validate storage ID
      if (!storageId) {
        return res
          .status(400)
          .send(Response.userFailResp("Storage ID is required"));
      }

      // Find storage by ID and userId
      const storage = await Storage.findOne({ _id: storageId, userId });
      if (!storage) {
        return res.status(404).send(Response.userFailResp("Storage not found"));
      }

      switch (storage.type) {
        case "google_drive_oauth":
          req.updateId = storageId; // Pass storage ID for OAuth flow
          return this.googleAuthUrl(req, res, _next); // OAuth flow
        case "s3":
          req.updateId = storageId; // Pass storage ID for S3 update
          return this.handleS3Storage(req, res, _next);
        case "sftp":
          req.updateId = storageId; // Pass storage ID for SFTP update
          return this.handleSFTPStorage(req, res, _next);
        default:
          return res.status(400).json({ error: "Unsupported storage type" });
      }
    } catch (err) {
      logger.error("Error updating storage:", err);
      return res
        .status(500)
        .send(Response.userFailResp("Error updating storage", err.message));
    }
  }

  async uploadFile(req, res, _next) {
    try {
      const userId = req?.body?.adminId;
      const storage = await Storage.findOne({
        userId,
        active: true,
      });

      if (!storage) {
        return res.status(404).json({ error: "Storage not found" });
      }

      const creds = JSON.parse(decryptJSON(storage.credentials));
      switch (storage.type) {
        case "google_drive_oauth":
          return this.uploadToGoogleDrive(req, res, creds, storage._id, userId);
        case "s3":
          return this.uploadToS3(req, res, creds, storage._id, userId);
        case "sftp":
          return this.uploadToSFTP(req, res, creds, storage._id, userId);
        default:
          return res.status(400).json({ error: "Unsupported storage type" });
      }
    } catch (error) {
      logger.error("Error while uploading file", error);
      return res.status(500).json({ error: "Failed to upload video" });
    }
  }
  async uploadToGoogleDrive(req, res, creds, storageId, userId) {
    try {
      const { clientId, clientSecret, refresh_token } = creds;

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token });

      const drive = google.drive({ version: "v3", auth: oauth2Client });

      // 1. Find or create the "VideoraIQ" folder
      const parentFolderId = await this.findOrCreateFolder(
        drive,
        "VideoraIQ",
        null
      );
      // 2. Find or create the "Incidents" subfolder
      const incidentsFolderId = await this.findOrCreateFolder(
        drive,
        "Incidents",
        parentFolderId
      );

      // 3. Upload file into the folder
      const ext = mime.extension(req.file.mimetype);
      const fileMetadata = {
        name: `${randomUUID()}.${ext}`,
        parents: [incidentsFolderId],
      };

      const media = {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path, {
          highWaterMark: 16 * 1024 * 1024,
        }),
      };

      const driveRes = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: "*",
      });
      const fileId = driveRes?.data?.id;

      // Make public
      // await drive.permissions.create({
      //   fileId: fileId,
      //   requestBody: {
      //     role: "reader", // viewer
      //     type: "anyone", // no login required
      //   },
      // });

      //Storing video meta data in Files Schema
      const file = await filesModel.create({
        userId,
        storageId,
        fileId,
      });

      safeTempFileDelete(req.file.path);

      return res.status(200).json({ fileId: file._id });
    } catch (error) {
      logger.error("Error uploading to Google Drive:", error);
      safeTempFileDelete(req.file.path);
      return res
        .status(500)
        .json({ error: "Failed to upload file to Google Drive" });
    }
  }

  // Helper function: finds or creates a folder
  async findOrCreateFolder(drive, name, parentId) {
    const q = [
      `name='${name}'`,
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
    ];
    if (parentId) q.push(`'${parentId}' in parents`);

    const list = await drive.files.list({
      q: q.join(" and "),
      fields: "files(id, name)",
    });
    if (list.data.files.length > 0) {
      return list.data.files[0].id;
    }
    const fileMetadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : [],
    };
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: "id",
    });
    return folder.data.id;
  }

  async uploadToS3(req, res, creds, storageId, userId) {
    try {
      const { accessKeyId, secretAccessKey, bucketName, region } = creds;

      const s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });

      const ext = mime.extension(req.file.mimetype);
      const fileStream = fs.createReadStream(req.file.path, {
        highWaterMark: 16 * 1024 * 1024,
      });

      const uploadParams = {
        Bucket: bucketName,
        Key: `creatives/${randomUUID()}.${ext}`,
        Body: fileStream,
        ContentType: req.file.mimetype,
        ContentLength: req.file.size,
      };

      const data = await s3.send(new PutObjectCommand(uploadParams));

      //Storing video meta data in Files Schema
      const file = await filesModel.create({
        userId,
        storageId,
        fileId: uploadParams.Key,
      });

      safeTempFileDelete(req.file.path);

      return res.status(200).json({ fileId: file._id });
    } catch (error) {
      logger.error("Error uploading to S3:", error);
      safeTempFileDelete(req.file.path);
      return res.status(500).json({ error: "Failed to upload file to S3" });
    }
  }
  async getSftpClient(storageId, creds) {
    const id = storageId.toString();
    let session = sftpPool.get(id);

    if (session) {
      session.lastUsed = Date.now();
      return session;
    }

    const client = new Client();

    // Remove from pool if connection closes or errors
    const cleanup = () => {
      if (sftpPool.get(id)?.client === client) {
        sftpPool.delete(id);
      }
    };
    client.on("close", cleanup);
    client.on("end", cleanup);
    client.on("error", (err) => {
      logger.error(`SFTP connection error for storage ${id}:`, err);
      cleanup();
    });

    await client.connect(creds);

    session = {
      client,
      activeRequests: 0,
      lastUsed: Date.now(),
      storageId: id,
    };
    sftpPool.set(id, session);

    return session;
  }

  async uploadToSFTP(req, res, creds, storageId, userId) {
    const { host, port, username, password, path: basePath } = creds;
    let poolSession;

    try {
      // Connect to SFTP using pool
      poolSession = await this.getSftpClient(storageId, creds);
      poolSession.activeRequests++;
      const sftp = poolSession.client;

      // Define base folder for this storage
      const folderName = req.body?.folderName || "incidents";
      const baseFolder = `${basePath}/${folderName}`;
      const ext = mime.extension(req.file.mimetype);
      const fileName = `${randomUUID()}.${ext}`;
      const remotePath = path.posix.join(baseFolder, fileName);

      // Ensure directory exists
      try {
        await sftp.mkdir(baseFolder, true); // recursive = true
      } catch (err) {
        if (!err.message.includes("Failure")) throw err; // ignore if already exists
      }

      // Upload the file
      // await sftp.put(readStream, remotePath);
      await pipeline(
        fs.createReadStream(req.file.path, { highWaterMark: 16 * 1024 * 1024 }),
        sftp.createWriteStream(remotePath, { highWaterMark: 16 * 1024 * 1024 })
      );

      // Close connection - REMOVED for pooling
      // await sftp.end();

      //Storing video meta data in Files Schema
      const file = await filesModel.create({
        userId,
        storageId,
        fileId: remotePath,
      });

      safeTempFileDelete(req.file.path);

      return res.status(200).json({
        success: true,
        path: file.fileId,
      });
    } catch (error) {
      logger.error("SFTP Upload Error:", error.message);
      safeTempFileDelete(req.file.path);
      return res.status(500).json({ error: "Failed to upload file to SFTP" });
    } finally {
      if (poolSession) {
        poolSession.activeRequests--;
        poolSession.lastUsed = Date.now();
      }
    }
  }
  async streamFile(req, res, next) {
    try {
      const fileId = req.params.id;
      return await this.streamFileInternal(fileId, req, res);
    } catch (error) {
      logger.error("Error while streaming file", error);
      return res.status(500).json({ error: "Failed to stream file" });
    }
  }

  async smartStreamFile(req, res) {
    try {
      const inputPath = decodeURIComponent(req.params.path);
      if (!inputPath || !inputPath.trim()) {
        return res.status(400).json({ error: "Path parameter is required" });
      }

      const fileExist = await filesModel.findOne({
        fileId: { $regex: inputPath }
      });

      if (fileExist) {
        return await this.streamFileInternal(fileExist._id, req, res);
      }

      // 1. Check Global SFTP
      try {
        const sftp = await connectSFTP();

        if (inputPath.includes("..")) {
          return res.status(400).json({
            status: "failed",
            message: "Invalid media path.",
          });
        }

        const fileName = path.basename(inputPath);
        const contentType = getManualMimeType(fileName);

        const sftpStream = await sftp.createReadStream(inputPath);

        sftpStream.on("error", (err) => {
          console.error("SFTP stream error:", err);
          throw new Error("File not found on SFTP");
        });

        // Security + no-cache headers
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Accept-Ranges", "bytes");

        // ✅ CORS + isolation headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Opener-Policy", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "*");

        await pipeline(sftpStream, res);
        return; // STOP EXECUTION HERE
      } catch (err) {
        logger.debug(
          "Global SFTP check failed or file not found:",
          err.message
        );
        // Continue to fallback
      }

      // 2. Fallback: Check internal Files model
      // Check if it's a valid ID or search by fileId (path)
      let fileMetaData = await filesModel.findOne({ fileId: inputPath });

      if (!fileMetaData) {
        // If regular mongoose ID?
        if (inputPath.match(/^[0-9a-fA-F]{24}$/)) {
          fileMetaData = await filesModel.findOne({ _id: inputPath });
        }
      }

      if (fileMetaData) {
        return await this.streamFileInternal(fileMetaData._id, req, res);
      }

      return res.status(404).json({ error: "File not found in storage" });
    } catch (error) {
      logger.error("Error in smartStreamFile:", error);
      return res.status(500).json({ error: "Failed to read file" });
    }
  }

  async streamFileInternal(fileId, req, res) {
    try {
      const fileMetaData = await filesModel.findOne({ _id: fileId });

      if (!fileMetaData) {
        return res.status(404).send(Response.userFailResp("File not found"));
      }

      const storage = await Storage.findOne({
        _id: fileMetaData.storageId,
      });

      if (!storage) {
        return res.status(404).send(Response.userFailResp("Storage not found"));
      }

      const creds = JSON.parse(decryptJSON(storage.credentials));
      const fileKey = fileMetaData.fileId;
      switch (storage.type) {
        case "google_drive_oauth":
          return this.streamFromGoogleDrive(req, res, creds, fileKey);
        case "s3":
          return this.streamFromS3(req, res, creds, fileKey);
        case "sftp":
          return this.streamFromSFTP(req, res, creds, fileKey, storage._id);
        default:
          return res.status(400).json({ error: "Unsupported storage type" });
      }
    } catch (error) {
      logger.error("Error while streaming file", error);
      // Ensure we don't double response if called from wrapper
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to stream file" });
      }
    }
  }
  async streamFromGoogleDrive(req, res, creds, fileId) {
    try {
      const { clientId, clientSecret, refresh_token } = creds;
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token });

      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const range = req.headers.range;

      // Fetch metadata in background
      const metadataPromise = drive.files.get({
        fileId,
        fields: "mimeType, size",
        supportsAllDrives: true,
      });

      // Prepare headers & start streaming immediately
      if (range) {
        const { data: meta } = await metadataPromise;
        const fileSize = parseInt(meta.size, 10);
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const { data: stream } = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          {
            responseType: "stream",
            headers: { Range: `bytes=${start}-${end}` },
          }
        );
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": meta.mimeType,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Range",
          "Access-Control-Expose-Headers":
            "Content-Range, Accept-Ranges, Content-Length, Content-Type",
          "Cross-Origin-Opener-Policy": "unsafe-none",
          "Cross-Origin-Resource-Policy": "cross-origin",
        });

        stream.pipe(res);
      } else {
        const { data: meta } = await metadataPromise;

        const { data: stream } = await drive.files.get(
          { fileId, alt: "media", supportsAllDrives: true },
          { responseType: "stream" }
        );
        res.writeHead(200, {
          "Content-Length": meta.size,
          "Content-Type": meta.mimeType,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Range",
          "Access-Control-Expose-Headers":
            "Content-Range, Accept-Ranges, Content-Length, Content-Type",
          "Cross-Origin-Opener-Policy": "unsafe-none",
          "Cross-Origin-Resource-Policy": "cross-origin",
        });

        stream.pipe(res);
      }
    } catch (err) {
      logger.error("Stream error", err);
      if (!res.headersSent) res.status(500).send("Streaming error");
    }
  }

  async streamFromS3(req, res, creds, fileId) {
    try {
      const { accessKeyId, secretAccessKey, bucketName, region } = creds;

      const s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });

      // Get file metadata first
      const headResp = await s3.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: fileId,
        })
      );

      const fileSize = parseInt(headResp.ContentLength, 10);
      const range = req.headers.range;

      if (range) {
        // ---- Handle partial request ----
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const data = await s3.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: fileId,
            Range: `bytes=${start}-${end}`,
          })
        );

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": headResp.ContentType || "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Range",
          "Access-Control-Expose-Headers":
            "Content-Range, Accept-Ranges, Content-Length, Content-Type",
          "Cross-Origin-Opener-Policy": "unsafe-none",
          "Cross-Origin-Resource-Policy": "cross-origin",
        });

        data.Body.pipe(res);
      } else {
        // ---- Handle full file ----
        const data = await s3.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: fileId,
          })
        );

        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": headResp.ContentType || "video/mp4",
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Range",
          "Access-Control-Expose-Headers":
            "Content-Range, Accept-Ranges, Content-Length, Content-Type",
          "Cross-Origin-Opener-Policy": "unsafe-none",
          "Cross-Origin-Resource-Policy": "cross-origin",
        });

        data.Body.pipe(res);
      }
    } catch (error) {
      logger.error("Error streaming from S3:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream file from S3" });
      }
    }
  }
  async streamFromSFTP(_req, res, creds, inputPath, storageId) {
    let poolSession;

    try {
      // Connect using pool
      poolSession = await this.getSftpClient(storageId, creds);
      poolSession.activeRequests++;
      const sftp = poolSession.client;

      const fileName = path.basename(inputPath);
      const contentType = getManualMimeType(fileName);

      const sftpStream = await sftp.createReadStream(inputPath);

      sftpStream.on("error", (err) => {
        console.error("SFTP stream error:", err);
        throw new Error("File not found on SFTP");
      });

      // Security + no-cache headers
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Accept-Ranges", "bytes");

      // ✅ CORS + isolation headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Opener-Policy", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "*");

      await pipeline(sftpStream, res);
      return;
    } catch (error) {
      logger.error("SFTP Error:", error);

      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream file from S3" });
      } else {
        res.end();
      }
      // Do not end sftp here
    } finally {
      if (poolSession) {
        poolSession.activeRequests--;
        poolSession.lastUsed = Date.now();
      }
    }
  }

  async handleRangeRequest(sftp, remotePath, range, res, fileSize) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    if (start >= fileSize || end >= fileSize) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.status(416).end();
    }

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": getManualMimeType(remotePath),
    });

    const readStream = sftp.createReadStream(remotePath, { start, end });
    try {
      await pipeline(readStream, res);
    } catch (err) {
      if (err.code === "ERR_STREAM_PREMATURE_CLOSE") {
        // console.debug("Client aborted range stream (normal during seeking)");
      } else {
        console.error("Range pipeline error:", err);
        throw err;
      }
    } finally {
      // await sftp.end().catch(() => {});
    }
  }
}

export default new StorageService();
