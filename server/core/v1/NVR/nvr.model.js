import mongoose from "mongoose";
import { encrypt, decrypt } from "../../../utils/cryptoUtils.js";
import authorizedChannelsModel from "../cameraRestrictions/authorizedChannels.model.js";

import config from "config";
const APP_ENV = config.get("APP_ENV");

let NVRSchema;

// ! new
const localSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    nvrName: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
      enum: ["hikvision", "dahua", "prama", "cpplus", "camera", "tiandy", "securus", "hanwha"],
    },
    cameraCount: {
      type: Number,
      default: 0,
    },
    domain: {
      type: String,
      required: true,
    },
    deviceName: String,
    location: {
      type: String,
      required: true,
    },
    localNvrId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// ! old
const cloudSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    nvrName: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
      required: true,
      // unique: true,
    },
    port: {
      type: Number,
      required: true,
    },
    rtspPort: {
      type: Number,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
      enum: ["hikvision", "dahua", "prama", "cpplus", "camera", "tiandy", "securus", "hanwha"],
    },
    cameraCount: {
      type: Number,
      default: 0,
    },
    deviceName: String,
    model: String,
    serialNumber: String,
    macAddress: String,
    firmwareVersion: String,
    deviceType: String,
    location: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

if (APP_ENV === "cloud") {
  NVRSchema = cloudSchema;

  // Compound unique index: IP + port + userId
  NVRSchema.index({ ip: 1, port: 1, userId: 1 }, { unique: true });

  // Encrypt sensitive fields before save
  NVRSchema.pre("save", function (next) {
    if (this.isModified("password")) {
      this.password = encrypt(this.password);
    }
    if (this.isModified("ip")) {
      this.ip = encrypt(this.ip);
    }
    if (this.isModified("serialNumber")) {
      this.serialNumber = encrypt(this.serialNumber);
    }
    if (this.isModified("macAddress")) {
      this.macAddress = encrypt(this.macAddress);
    }
    next();
  });

  // Decrypt method
  NVRSchema.methods.getDecryptedPassword = function () {
    return decrypt(this.password);
  };
} else if (APP_ENV === "local") {
  NVRSchema = localSchema;
} else {
  throw new Error(`Invalid APP_ENV: ${APP_ENV}`);
}

async function applyNvrAccessControl(query) {
  const memberId = query._conditions?.memberId;
  const queryType = query._conditions?.queryType;

  //Remove from Query for matching exact query results
  delete query._conditions.memberId;
  delete query._conditions.queryType;
  // No memberId → skip access control
  if (!memberId) return;

  //Type = query._conditions?.queryType;
  // Fetch allowed NVRs
  const authorized = await authorizedChannelsModel.findOne({
    userId: memberId,
  });
  if (!authorized) return;

  if (queryType && queryType === "location") {
    const allowed = authorized.locations;

    // If allowed list empty → return no results
    if (!Array.isArray(allowed) || allowed.length === 0) {
      query.where({ location: { $in: [] } });
      return;
    }

    query.where({ location: { $in: allowed } });
  } else {
    const allowed = authorized.nvrIds;

    // If allowed list empty → return no results
    if (!Array.isArray(allowed) || allowed.length === 0) {
      query.where({ _id: { $in: [] } });
      return;
    }

    query.where({ _id: { $in: allowed } });
  }
}

// Attach to find(), findOne(), distinct()
NVRSchema.pre(/^find/, async function () {
  await applyNvrAccessControl(this);
});

NVRSchema.pre("distinct", async function () {
  await applyNvrAccessControl(this);
});

export default mongoose.model("NVR", NVRSchema);
