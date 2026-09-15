import net from "net";
import axios from "axios";
import mongoose from "mongoose";
import RaspberryPiDevice from "../raspberryPi/raspberryPi.model.js";
import MeasurementCalibration from "./measurementCalibration.model.js";
import { calibrationRequestSchema, calibrationZoneSchema } from "./measurementCalibration.validation.js";
import logger from "../../../utils/logger.js";

const DS_PORT = 8000;
const DS_ROOT = "/v1/calibration";

function adminIdFrom(req) {
  const user = req?.verified?.userData || {};
  if (!user.adminId || user.memberId) return "";
  return String(user.adminId);
}

function dsHost(ip) {
  const value = String(ip || "").trim();
  if (!net.isIP(value)) throw Object.assign(new Error("The station has an invalid IP address"), { status: 422 });
  return net.isIPv6(value) ? `[${value}]` : value;
}

export function calibrationDsUrl(ip, suffix = "") {
  const path = suffix ? `/${String(suffix).replace(/^\/+/, "")}` : "";
  return `http://${dsHost(ip)}:${DS_PORT}${DS_ROOT}${path}`;
}

function dsError(error, action) {
  if (error?.status) return error;
  const responseStatus = Number(error?.response?.status);
  let responseData = error?.response?.data;
  if (Buffer.isBuffer(responseData) || responseData instanceof ArrayBuffer) {
    try {
      responseData = JSON.parse(Buffer.from(responseData).toString("utf8"));
    } catch {
      responseData = null;
    }
  }
  const detail = responseData?.detail || responseData?.message;
  if (responseStatus >= 400 && responseStatus < 600) {
    return Object.assign(new Error(detail || `DS ${action} request failed`), { status: responseStatus });
  }
  const timedOut = error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT";
  return Object.assign(
    new Error(timedOut ? `DS ${action} request timed out` : `Unable to reach the station calibration service`),
    { status: timedOut ? 504 : 502 },
  );
}

async function approvedStation(req) {
  const adminId = adminIdFrom(req);
  if (!mongoose.isValidObjectId(adminId)) {
    throw Object.assign(new Error("Administrator access is required"), { status: 403 });
  }
  const deviceId = String(req.params?.deviceId || "");
  if (!mongoose.isValidObjectId(deviceId)) {
    throw Object.assign(new Error("Invalid Raspberry Pi device"), { status: 400 });
  }
  const device = await RaspberryPiDevice.findOne({
    _id: deviceId,
    admin: adminId,
    approvalStatus: "approved",
  }).lean();
  if (!device) {
    throw Object.assign(new Error("Approved Raspberry Pi station was not found"), { status: 404 });
  }
  dsHost(device.ip);
  return device;
}

function sendFailure(res, error, action) {
  const normalized = dsError(error, action);
  logger.warn(`[MEASUREMENT_CALIBRATION] ${action} failed: ${normalized.message}`);
  return res.status(normalized.status || 500).json({
    statusCode: normalized.status || 500,
    body: { status: "failed", message: normalized.message },
  });
}

function sendData(res, statusCode, message, data) {
  return res.status(statusCode).json({
    statusCode,
    body: { status: "success", message, data },
  });
}

function sendPersistenceFailure(res, error, action) {
  if (error?.status) return sendFailure(res, error, action);
  logger.error(`[MEASUREMENT_CALIBRATION] ${action} failed: ${error?.message || error}`);
  return res.status(500).json({
    statusCode: 500,
    body: { status: "failed", message: "The calibration zone could not be saved" },
  });
}

function zoneData(document) {
  if (!document) return null;
  return {
    points: document.points || [],
    min_zone_flat_ratio: document.minZoneFlatRatio,
    inlier_tolerance_mm: document.inlierToleranceMm,
    updated_at: document.updatedAt,
  };
}

class MeasurementCalibrationService {
  async status(req, res) {
    try {
      const device = await approvedStation(req);
      const response = await axios.get(calibrationDsUrl(device.ip, "status"), { maxRedirects: 0, timeout: 5000 });
      return sendData(res, 200, "Calibration status fetched", response.data);
    } catch (error) {
      return sendFailure(res, error, "status");
    }
  }

  async capture(req, res) {
    try {
      const device = await approvedStation(req);
      const response = await axios.post(calibrationDsUrl(device.ip, "frame"), undefined, { maxRedirects: 0, timeout: 25000 });
      return sendData(res, 200, "Calibration frame captured", response.data);
    } catch (error) {
      return sendFailure(res, error, "frame capture");
    }
  }

  async frame(req, res) {
    try {
      const device = await approvedStation(req);
      const response = await axios.get(calibrationDsUrl(device.ip, "frame.jpg"), {
        responseType: "arraybuffer",
        maxContentLength: 15 * 1024 * 1024,
        maxRedirects: 0,
        timeout: 10000,
      });
      res.set({
        "Content-Type": response.headers?.["content-type"] || "image/jpeg",
        "Cache-Control": "no-store",
      });
      return res.status(200).send(Buffer.from(response.data));
    } catch (error) {
      return sendFailure(res, error, "frame preview");
    }
  }

  async run(req, res) {
    const validation = calibrationRequestSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
      return sendFailure(
        res,
        Object.assign(new Error(validation.error.details.map((item) => item.message).join(", ")), { status: 422 }),
        "start",
      );
    }
    try {
      const device = await approvedStation(req);
      const response = await axios.post(calibrationDsUrl(device.ip, "run"), validation.value, { maxRedirects: 0, timeout: 10000 });
      return sendData(res, 202, "Calibration started", response.data);
    } catch (error) {
      return sendFailure(res, error, "start");
    }
  }

  async zone(req, res) {
    try {
      await approvedStation(req);
      const document = await MeasurementCalibration.findOne({
        adminId: adminIdFrom(req),
        deviceId: req.params.deviceId,
      }).lean();
      return sendData(res, 200, "Saved calibration zone fetched", zoneData(document));
    } catch (error) {
      return sendPersistenceFailure(res, error, "saved zone fetch");
    }
  }

  async saveZone(req, res) {
    const validation = calibrationZoneSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
      return sendFailure(
        res,
        Object.assign(new Error(validation.error.details.map((item) => item.message).join(", ")), { status: 422 }),
        "saved zone update",
      );
    }
    try {
      const device = await approvedStation(req);
      const document = await MeasurementCalibration.findOneAndUpdate(
        { adminId: adminIdFrom(req), deviceId: device._id },
        {
          $set: {
            stationId: device.mac,
            points: validation.value.points,
            minZoneFlatRatio: validation.value.min_zone_flat_ratio,
            inlierToleranceMm: validation.value.inlier_tolerance_mm,
          },
        },
        { new: true, runValidators: true, setDefaultsOnInsert: true, upsert: true },
      ).lean();
      return sendData(res, 200, "Calibration zone saved", zoneData(document));
    } catch (error) {
      return sendPersistenceFailure(res, error, "saved zone update");
    }
  }
}

export { adminIdFrom, approvedStation, dsError };
export default new MeasurementCalibrationService();
