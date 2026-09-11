import config from "config";
import mongoose from "mongoose";
import AdminStorageConfig from "./adminStorage.model.js";
import { decryptData } from "../../../utils/cryptoUtils.js";
import logger from "../../../utils/logger.js";

const PROVIDER_ALIASES = {
  nas: "nas",
  sftp: "nas",
  aws: "aws",
  s3: "aws",
  gcp: "gcp",
  gcs: "gcp",
  oracle: "oracle",
  oci: "oracle",
};

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || String(value).toLowerCase() === "true";
};

const optionalConfig = (key, fallback = {}) => {
  try {
    return config.has(key) ? config.get(key) : fallback;
  } catch {
    return fallback;
  }
};

export function adminStorageFeatureEnabled() {
  const explicit = process.env.ADMIN_STORAGE_CONFIG_ENABLED;
  if (explicit !== undefined) return bool(explicit);
  if (config.has("ADMIN_STORAGE_CONFIG_ENABLED")) {
    return bool(config.get("ADMIN_STORAGE_CONFIG_ENABLED"));
  }
  // On-prem installations remain ENV-only unless explicitly opted in.
  return String(optionalConfig("APP_ENV", "")).toLowerCase() !== "onprem";
}

export function resolveEnvStorage(providerOverride) {
  const media = optionalConfig("MediaStorage", {});
  const requested = String(
    providerOverride || process.env.MEDIA_STORAGE_PROVIDER || media.provider || "nas",
  ).toLowerCase();
  const provider = PROVIDER_ALIASES[requested];
  if (!provider) throw new Error(`Unsupported storage provider: ${requested}`);

  if (provider === "nas") {
    const sftp = optionalConfig("SFTP", {});
    return {
      source: "env",
      provider,
      versionId: "env",
      config: {
        host: sftp.IP,
        port: Number(sftp.Port) || 22,
        username: sftp["user-name"],
        password: sftp.Password,
        basePath: sftp.Path,
      },
    };
  }

  const cfg = media[provider] || media[provider === "aws" ? "s3" : provider === "gcp" ? "gcs" : "oracle"] || {};
  if (provider === "aws") {
    return {
      source: "env", provider, versionId: "env",
      config: {
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || cfg.region,
        bucket: process.env.AWS_S3_BUCKET || cfg.bucket,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || cfg.accessKeyId,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || cfg.secretAccessKey,
        sessionToken: process.env.AWS_SESSION_TOKEN || cfg.sessionToken,
        endpoint: process.env.AWS_S3_ENDPOINT || cfg.endpoint,
        forcePathStyle: bool(process.env.AWS_S3_FORCE_PATH_STYLE ?? cfg.forcePathStyle),
      },
    };
  }
  if (provider === "gcp") {
    return {
      source: "env", provider, versionId: "env",
      config: {
        region: process.env.GCP_STORAGE_REGION || cfg.region || "auto",
        bucket: process.env.GCP_STORAGE_BUCKET || cfg.bucket,
        accessKeyId: process.env.GCP_HMAC_ACCESS_KEY_ID || cfg.accessKeyId,
        secretAccessKey: process.env.GCP_HMAC_SECRET_ACCESS_KEY || cfg.secretAccessKey,
        endpoint: process.env.GCP_STORAGE_ENDPOINT || cfg.endpoint || "https://storage.googleapis.com",
        forcePathStyle: true,
      },
    };
  }
  const region = process.env.OCI_REGION || cfg.region;
  const namespace = process.env.OCI_NAMESPACE || cfg.namespace;
  return {
    source: "env", provider, versionId: "env",
    config: {
      region,
      namespace,
      bucket: process.env.OCI_BUCKET || cfg.bucket,
      accessKeyId: process.env.OCI_ACCESS_KEY_ID || cfg.accessKeyId,
      secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY || cfg.secretAccessKey,
      endpoint: process.env.OCI_ENDPOINT || cfg.endpoint ||
        (namespace && region ? `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com` : undefined),
      forcePathStyle: true,
    },
  };
}

// Object paths start with v2; NAS paths may have a configured base directory.
export function parseV2StoragePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  const match = normalized.match(/(?:^|\/)v2\/([a-f\d]{24})\/(env|[a-f\d]{24})\/(nas|aws|gcp|oracle)\/(.+)$/i);
  if (!match) return null;
  return {
    adminId: match[1],
    versionId: match[2].toLowerCase(),
    provider: match[3].toLowerCase(),
    relativeKey: `v2/${match[1]}/${match[2]}/${match[3].toLowerCase()}/${match[4]}`,
  };
}

async function loadAdminVersion(adminId, versionId) {
  const doc = await AdminStorageConfig.findOne({ adminId }).select("+versions.encryptedConfig").lean();
  if (!doc) return null;
  const selectedId = versionId || doc.activeVersion?.toString();
  if (!doc.enabled || !selectedId) return null;
  const version = doc.versions.find((item) => item._id.toString() === selectedId);
  if (!version) return null;
  return {
    source: "admin",
    provider: version.provider,
    versionId: version._id.toString(),
    config: decryptData(version.encryptedConfig),
  };
}

export async function resolveStorageConfig({ adminId, storagePath } = {}) {
  const parsed = parseV2StoragePath(storagePath);
  if (parsed?.versionId === "env") {
    return { ...resolveEnvStorage(parsed.provider), adminId: parsed.adminId, parsed };
  }

  const ownerId = parsed?.adminId || String(adminId || "");
  if (adminStorageFeatureEnabled() && mongoose.isValidObjectId(ownerId)) {
    try {
      const resolved = await loadAdminVersion(ownerId, parsed?.versionId);
      if (resolved) {
        if (parsed && resolved.provider !== parsed.provider) {
          throw new Error("Stored media provider does not match its configuration version");
        }
        return { ...resolved, adminId: ownerId, parsed };
      }
    } catch (error) {
      // A configured-but-invalid record is not silently redirected into the
      // shared bucket. Only an unavailable lookup gets the non-blocking ENV fallback.
      if (error?.name !== "MongoNetworkError" && error?.name !== "MongooseServerSelectionError") throw error;
      logger.warn(`[ADMIN-STORAGE] lookup unavailable for ${ownerId}; using ENV: ${error.message}`);
    }
  }

  return { ...resolveEnvStorage(parsed?.provider), adminId: ownerId || null, parsed };
}

export function publicStorageSummary(resolved) {
  const value = resolved?.config || {};
  return {
    source: resolved?.source || "env",
    provider: resolved?.provider || "nas",
    label: value.label || "",
    region: value.region || "",
    bucket: value.bucket || "",
    endpoint: value.endpoint || "",
    host: value.host || "",
    port: value.port || "",
    username: value.username || "",
    basePath: value.basePath || "",
    hasAccessKey: Boolean(value.accessKeyId),
    hasSecret: Boolean(value.secretAccessKey || value.password),
  };
}
