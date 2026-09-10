import jwt from "jsonwebtoken";
import config from "config";
import { decrypt } from "../../../utils/cryptoUtils.js";
import RaspberryPiDevice from "../raspberryPi/raspberryPi.model.js";

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.get("authorization") || ""));
  return match?.[1]?.trim() || "";
}

export async function validateStationToken(token) {
  if (!token) throw new Error("Approved station token is required");
  try {
    const claims = jwt.verify(token, config.get("jwt.secretKey"), {
      algorithms: ["HS512"],
    });
    if (claims?.tokenType !== "raspberry-pi" || !claims.stationId) {
      throw new Error("Wrong token type");
    }

    const mac = String(claims.stationId).trim().toLowerCase();
    const device = await RaspberryPiDevice.findOne({
      $or: [{ mac }, { deviceData: mac }],
      approvalStatus: "approved",
    });
    if (!device?.tokenEncrypted) throw new Error("Station is not approved");

    const persistedToken = decrypt(device.tokenEncrypted);
    if (persistedToken !== token) throw new Error("Station token was replaced");

    return { device, claims };
  } catch {
    throw new Error("Invalid or unapproved station token");
  }
}

export default async function verifyStationToken(req, res, next) {
  try {
    const { device, claims } = await validateStationToken(bearerToken(req));
    req.stationDevice = device;
    req.stationToken = claims;
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, message: error.message });
  }
}

export { bearerToken };
