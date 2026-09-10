import verifyToken from "../../../middlewares/verifyToken.js";
import verifyStationToken, { bearerToken } from "../measurements/stationToken.middleware.js";

export default function verifyMeasurementAuth(req, res, next) {
  if (!bearerToken(req)) return verifyToken(req, res, next);

  return verifyStationToken(req, res, () => {
    const device = req.stationDevice;
    req.verified = {
      userData: {
        adminId: device.admin ? String(device.admin) : "",
        stationId: String(req.stationToken.stationId || ""),
        actorId: String(req.stationToken.stationId || ""),
        tokenType: "raspberry-pi",
      },
    };
    next();
  });
}

