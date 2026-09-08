import jwt from "jsonwebtoken";
import config from "config";
import Admin from "../admin/admin.model.js";
import RaspberryPiDevice from "./raspberryPi.model.js";
import { decrypt, encrypt } from "../../../utils/cryptoUtils.js";
const HEADER = "x-raspberry-pi-data";
class RaspberryPiService {
  readDevice(req) {
    const value = req.get(HEADER);
    if (!value) {
      throw Object.assign(new Error(`Missing ${HEADER} header`), { status: 400 });
    }
    try {
      return decrypt(value);
    } catch {
      throw Object.assign(new Error("Invalid Raspberry Pi header"), { status: 400 });
    }
  }

  async register(req, res) {
    try {
      const deviceData = this.readDevice(req);
      let device = await RaspberryPiDevice.findOne({ deviceData });

      if (device) {
        device.status = "connected";
        device.lastSeenAt = new Date();
        await device.save();
        return res.json({ ok: true, token: device.tokenEncrypted, adminId: device.admin, status: device.status });
      }

      const admin = await Admin.findOne().sort({ _id: 1 });
      if (!admin) return res.status(404).json({ ok: false, message: "Admin not found" });

      const payload = {
        status: true,
        user_id: admin.user_id,
        login: admin.login,
        adminId: admin._id,
        orgId: admin.orgId,
        user_name: `${admin.name_f || ""} ${admin.name_l || ""}`.trim(),
        user_email: admin.email,
        name_f: admin.name_f || "",
        name_l: admin.name_l || "",
        created_from: "RaspberryPi",
      };
      const token = encrypt(jwt.sign(payload, config.get("jwt.secretKey"), { algorithm: "HS512" }));
      device = await RaspberryPiDevice.create({ deviceData, admin: admin._id, tokenEncrypted: token });
      return res.status(201).json({ ok: true, token, adminId: device.admin, status: device.status });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : "Failed to register Raspberry Pi" });
    }
  }

  async heartbeat(req, res) {
    try {
      const deviceData = this.readDevice(req);
      const device = await RaspberryPiDevice.findOneAndUpdate(
        { deviceData },
        { status: "connected", lastSeenAt: new Date() },
        { new: true },
      );
      if (!device) return res.status(404).json({ ok: false, message: "Raspberry Pi is not registered" });
      return res.json({ ok: true, status: device.status, lastSeenAt: device.lastSeenAt });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : "Heartbeat failed" });
    }
  }
}
export default new RaspberryPiService();
