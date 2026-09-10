import express from "express";
import controller from "./measurements.controller.js";
import verifyStationToken from "./stationToken.middleware.js";

const router = express.Router();
const rawJpeg = express.raw({ type: "image/jpeg", limit: "15mb" });

function parseJpeg(req, res, next) {
  rawJpeg(req, res, (error) => {
    if (!error) return next();
    if (error.type === "entity.too.large") {
      return res.status(413).json({ ok: false, message: "JPEG exceeds the 15 MB limit" });
    }
    return res.status(400).json({ ok: false, message: "Unable to read JPEG body" });
  });
}

router.post(
  "/captures",
  verifyStationToken,
  parseJpeg,
  controller.createCapture.bind(controller),
);
router.get("/captures/:filename", controller.fetchCapture.bind(controller));
router.delete(
  "/captures/:filename",
  verifyStationToken,
  controller.deleteCapture.bind(controller),
);

export { parseJpeg };
export default router;
