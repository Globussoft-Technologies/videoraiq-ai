import mongoose from "mongoose";
import AdminStorageConfig from "./adminStorage.model.js";
import { storageConfigSchema } from "./adminStorage.validation.js";
import {
  adminStorageFeatureEnabled,
  publicStorageSummary,
  resolveStorageConfig,
} from "./adminStorage.resolver.js";
import { encryptData, decryptData } from "../../../utils/cryptoUtils.js";
import { testStorageConnection, testStorageRoundTrip } from "./mediaStorage.v2.js";
import logger from "../../../utils/logger.js";

const adminIdFrom = (req) => String(req?.verified?.userData?.adminId || "");

async function currentVersion(adminId) {
  const doc = await AdminStorageConfig.findOne({ adminId }).select("+versions.encryptedConfig");
  if (!doc?.activeVersion) return { doc, version: null };
  return {
    doc,
    version: doc.versions.find((item) => item._id.equals(doc.activeVersion)) || null,
  };
}

function validationPayload(body, previous) {
  const provider = body?.provider;
  if (!previous || previous.provider !== provider) return body;
  const prior = decryptData(previous.encryptedConfig);
  const merged = { ...prior, ...body };
  for (const secret of ["password", "accessKeyId", "secretAccessKey", "sessionToken"]) {
    if (body[secret] === "" || body[secret] == null) merged[secret] = prior[secret];
  }
  return merged;
}

class AdminStorageService {
  async get(req, res) {
    try {
      const adminId = adminIdFrom(req);
      if (!mongoose.isValidObjectId(adminId)) return res.status(400).json({ message: "Invalid admin identity" });
      const featureAvailable = adminStorageFeatureEnabled();
      const resolved = await resolveStorageConfig({ adminId });
      return res.status(200).json({
        featureAvailable,
        configured: resolved.source === "admin",
        effective: publicStorageSummary(resolved),
      });
    } catch (error) {
      logger.error("Failed to fetch admin storage configuration", error);
      return res.status(500).json({ message: error.message });
    }
  }

  async save(req, res) {
    try {
      if (!adminStorageFeatureEnabled()) {
        return res.status(409).json({ message: "Admin storage configuration is disabled for this deployment" });
      }
      const adminId = adminIdFrom(req);
      if (!mongoose.isValidObjectId(adminId)) return res.status(400).json({ message: "Invalid admin identity" });

      const { doc: existing, version: previous } = await currentVersion(adminId);
      const candidate = validationPayload(req.body, previous);
      const { error, value } = storageConfigSchema.validate(candidate, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: error.details.map((item) => item.message).join(", ") });
      await testStorageConnection(value.provider, value);

      const doc = existing || new AdminStorageConfig({ adminId });
      const version = doc.versions.create({
        provider: value.provider,
        label: value.label || "",
        encryptedConfig: encryptData(value),
      });
      doc.versions.push(version);
      doc.activeVersion = version._id;
      doc.enabled = true;
      await doc.save();

      const resolved = await resolveStorageConfig({ adminId });
      return res.status(existing ? 200 : 201).json({
        featureAvailable: true,
        configured: true,
        effective: publicStorageSummary(resolved),
      });
    } catch (error) {
      logger.error("Failed to save admin storage configuration", error);
      return res.status(400).json({ message: `Storage connection failed: ${error.message}` });
    }
  }

  async test(req, res) {
    try {
      if (!adminStorageFeatureEnabled()) {
        return res.status(409).json({ message: "Admin storage configuration is disabled for this deployment" });
      }
      const adminId = adminIdFrom(req);
      const { version } = await currentVersion(adminId);
      const candidate = validationPayload(req.body, version);
      const { error, value } = storageConfigSchema.validate(candidate, { abortEarly: false, stripUnknown: true });
      if (error) return res.status(400).json({ message: error.details.map((item) => item.message).join(", ") });
      await testStorageRoundTrip(value.provider, value, req.file?.buffer);
      return res.status(200).json({ ok: true, message: "Storage connection successful" });
    } catch (error) {
      return res.status(400).json({ ok: false, message: `Storage connection failed: ${error.message}` });
    }
  }

}

export default new AdminStorageService();
