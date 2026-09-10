import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "config";
import RaspberryPiDevice from "./raspberryPi.model.js";
import { decrypt, decryptData, encrypt } from "../../../utils/cryptoUtils.js";
import { raspberryPiRegistrationSchema } from "./raspberryPi.validate.js";

const HEADER = "x-raspberry-pi-data";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeMac(value) {
  return String(value || "").trim().toLowerCase();
}

function adminIdentity(req) {
  const user = req?.verified?.userData || {};
  if (!user.adminId || user.memberId) return null;
  return String(user.adminId);
}

function publicDevice(device) {
  const value = device?.toObject ? device.toObject() : device;
  if (!value) return null;
  return {
    id: String(value._id || value.id || ""),
    code: value.code,
    mac: value.mac,
    ip: value.ip,
    station: value.station,
    approvalStatus: value.approvalStatus || "pending",
    connectivityStatus: value.status,
    registeredAt: value.registeredAt,
    lastSeenAt: value.lastSeenAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

class RaspberryPiService {
  readDevice(req) {
    const value = req.get(HEADER);
    if (!value) {
      throw Object.assign(new Error(`Missing ${HEADER} header`), { status: 400 });
    }

    let decoded;
    try {
      // Streaming/Pi bridge contract: <random iv hex>:<cipher hex>.
      decoded = decryptData(value);
    } catch {
      throw Object.assign(new Error("Invalid Raspberry Pi header"), { status: 400 });
    }

    const validation = raspberryPiRegistrationSchema.validate(decoded, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (validation.error) {
      throw Object.assign(
        new Error(validation.error.details.map((item) => item.message).join(", ")),
        { status: 400 },
      );
    }

    return { ...validation.value, mac: normalizeMac(validation.value.mac) };
  }

  async uniqueCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Array.from(
        { length: 6 },
        () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)],
      ).join("");
      if (!(await RaspberryPiDevice.exists({ code }))) return code;
    }
    throw new Error("Unable to allocate Raspberry Pi registration code");
  }

  async stationToken(device) {
    if (device.tokenEncrypted) {
      try {
        const existing = decrypt(device.tokenEncrypted);
        const claims = jwt.verify(existing, config.get("jwt.secretKey"));
        if (
          claims?.tokenType === "raspberry-pi" &&
          normalizeMac(claims.stationId) === normalizeMac(device.mac)
        ) {
          return existing;
        }
      } catch {
        // Old-format/invalid tokens are replaced without changing approval.
      }
    }

    const token = jwt.sign(
      {
        tokenType: "raspberry-pi",
        stationId: device.mac,
        registrationCode: device.code,
        deviceId: String(device._id),
        ...(device.admin ? { adminId: String(device.admin) } : {}),
      },
      config.get("jwt.secretKey"),
      { algorithm: "HS512" },
    );
    device.tokenEncrypted = encrypt(token);
    await device.save();
    return token;
  }

  async registrationResponse(device) {
    const status =
      device.approvalStatus ||
      (device.status === "connected" && device.tokenEncrypted ? "approved" : "pending");

    // Migrate records written by the old auto-approved implementation. This
    // never changes a known approval back to pending.
    if (!device.approvalStatus) {
      device.approvalStatus = status;
      if (!device.mac) device.mac = normalizeMac(device.deviceData);
      if (!device.code) device.code = await this.uniqueCode();
      await device.save();
    }

    if (status === "approved") {
      return { status, code: device.code, token: await this.stationToken(device) };
    }
    return { status, code: device.code };
  }

  async register(req, res) {
    try {
      const payload = this.readDevice(req);
      let device = await RaspberryPiDevice.findOne({
        $or: [{ mac: payload.mac }, { deviceData: payload.mac }],
      });

      if (!device) {
        device = await RaspberryPiDevice.create({
          deviceData: payload.mac,
          mac: payload.mac,
          code: await this.uniqueCode(),
          ip: payload.ip,
          station: payload.station,
          registrationPayload: payload,
          approvalStatus: "pending",
          status: "connected",
          lastSeenAt: new Date(),
        });
      } else {
        // Refresh volatile station details only. approvalStatus and token are
        // deliberately untouched, including during hourly silent refreshes.
        device.mac ||= payload.mac;
        if (!device.code) device.code = await this.uniqueCode();
        device.ip = payload.ip;
        device.station = payload.station;
        device.registrationPayload = payload;
        device.status = "connected";
        device.lastSeenAt = new Date();
        await device.save();
      }

      return res.status(200).json(await this.registrationResponse(device));
    } catch (error) {
      return res.status(error.status || 500).json({
        status: "error",
        message: error.status ? error.message : "Failed to register Raspberry Pi",
      });
    }
  }

  async registrationStatus(req, res) {
    try {
      const code = String(req.params.code || "").trim();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ status: "error", message: "Invalid registration code" });
      }

      const device = await RaspberryPiDevice.findOne({ code });
      if (!device) {
        return res.status(404).json({ status: "error", message: "Registration not found" });
      }
      return res.status(200).json(await this.registrationResponse(device));
    } catch {
      return res.status(500).json({ status: "error", message: "Failed to fetch registration status" });
    }
  }

  async adminRegistrations(req, res) {
    const adminId = adminIdentity(req);
    if (!adminId) {
      return res.status(403).json({ status: "error", message: "Administrator access is required" });
    }

    try {
      const code = String(req.query?.code || "").trim();
      if (code && !/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ status: "error", message: "Enter a valid 6-character registration code" });
      }

      if (code) {
        const device = await RaspberryPiDevice.findOne({
          code,
          $or: [{ admin: null }, { admin: adminId }],
        });
        if (!device) {
          return res.status(404).json({ status: "error", message: "Registration code was not found" });
        }
        return res.status(200).json({ status: "success", data: publicDevice(device) });
      }

      // Match the streaming demo: newly registered, unclaimed devices appear
      // automatically. Devices claimed by another administrator stay hidden.
      const devices = await RaspberryPiDevice.find({
        $or: [{ admin: null }, { admin: adminId }],
      })
        .sort({ approvalStatus: 1, createdAt: -1 })
        .lean();
      return res.status(200).json({
        status: "success",
        data: devices.map(publicDevice),
      });
    } catch (error) {
      return res.status(500).json({ status: "error", message: "Failed to load Raspberry Pi registrations" });
    }
  }

  async updateApproval(req, res) {
    const adminId = adminIdentity(req);
    if (!adminId) {
      return res.status(403).json({ status: "error", message: "Administrator access is required" });
    }

    const code = String(req.params?.code || "").trim();
    const approvalStatus = String(req.body?.status || "").trim().toLowerCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({ status: "error", message: "Invalid registration code" });
    }
    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({ status: "error", message: "Status must be approved or rejected" });
    }

    try {
      const update = {
        $set: {
          admin: adminId,
          approvalStatus,
          approvalUpdatedAt: new Date(),
        },
      };
      // A rejected device must lose its old station token immediately.
      if (approvalStatus === "rejected") update.$unset = { tokenEncrypted: 1 };

      const device = await RaspberryPiDevice.findOneAndUpdate(
        { code, $or: [{ admin: null }, { admin: adminId }] },
        update,
        { new: true, runValidators: true },
      );
      if (!device) {
        return res.status(404).json({ status: "error", message: "Registration code was not found" });
      }

      return res.status(200).json({
        status: "success",
        message: `Raspberry Pi ${approvalStatus}`,
        data: publicDevice(device),
      });
    } catch {
      return res.status(500).json({ status: "error", message: "Failed to update Raspberry Pi approval" });
    }
  }

  async deleteRegistration(req, res) {
    const adminId = adminIdentity(req);
    if (!adminId) {
      return res.status(403).json({ status: "error", message: "Administrator access is required" });
    }

    const code = String(req.params?.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({ status: "error", message: "Invalid registration code" });
    }

    try {
      const device = await RaspberryPiDevice.findOneAndDelete({
        code,
        $or: [{ admin: null }, { admin: adminId }],
      });
      if (!device) {
        return res.status(404).json({ status: "error", message: "Raspberry Pi registration was not found" });
      }

      return res.status(200).json({
        status: "success",
        message: "Raspberry Pi connection deleted",
        data: { code, mac: device.mac },
      });
    } catch {
      return res.status(500).json({ status: "error", message: "Failed to delete Raspberry Pi connection" });
    }
  }

  async heartbeat(req, res) {
    try {
      const payload = this.readDevice(req);
      const device = await RaspberryPiDevice.findOneAndUpdate(
        { $or: [{ mac: payload.mac }, { deviceData: payload.mac }] },
        {
          ip: payload.ip,
          station: payload.station,
          registrationPayload: payload,
          status: "connected",
          lastSeenAt: new Date(),
        },
        { new: true },
      );
      if (!device) {
        return res.status(404).json({ status: "error", message: "Raspberry Pi is not registered" });
      }
      return res.json({
        status: device.approvalStatus,
        code: device.code,
        lastSeenAt: device.lastSeenAt,
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        status: "error",
        message: error.status ? error.message : "Heartbeat failed",
      });
    }
  }
}

export { HEADER, adminIdentity, normalizeMac, publicDevice };
export default new RaspberryPiService();
