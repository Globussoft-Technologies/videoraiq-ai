import express from "express";
import multer from "multer";
import controller from "./measurements.controller.js";
import verifyStationToken from "./stationToken.middleware.js";

const router = express.Router();
const rawJpeg = express.raw({ type: "image/jpeg", limit: "15mb" });
const qrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
}).single("image");

function parseJpeg(req, res, next) {
  rawJpeg(req, res, (error) => {
    if (!error) return next();
    if (error.type === "entity.too.large") {
      return res.status(413).json({ ok: false, message: "JPEG exceeds the 15 MB limit" });
    }
    return res.status(400).json({ ok: false, message: "Unable to read JPEG body" });
  });
}

function parseQrImage(req, res, next) {
  qrUpload(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, message: "QR image exceeds the 15 MB limit" });
    }
    return res.status(400).json({ ok: false, message: "Unable to read QR image" });
  });
}

router.post(
  "/start",
  verifyStationToken,
  controller.startMeasurement.bind(controller),
);
router.post(
  "/qr/extract",
  verifyStationToken,
  parseQrImage,
  controller.extractQr.bind(controller),
);

router.post(
  "/captures",
  verifyStationToken,
  parseJpeg,
  controller.createCapture.bind(controller),
);
router.post(
  "/diagnostics",
  verifyStationToken,
  controller.createDiagnostic.bind(controller),
);
router.get("/captures/:filename", controller.fetchCapture.bind(controller));
router.delete(
  "/captures/:filename",
  verifyStationToken,
  controller.deleteCapture.bind(controller),
);

export { parseJpeg, parseQrImage };
export default router;
