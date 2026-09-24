import express from "express";
import multer from "multer";
import verifyToken from "../../../middlewares/verifyToken.js";
import measurementMediaService, { MAX_IMAGE_BYTES } from "./measurementMedia.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } });

router.post("/upload", verifyToken, (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ status: "failed", message: "Measurement image exceeds the 20 MB limit." });
    }
    return res.status(400).json({ status: "failed", message: "Unable to read measurement image." });
  });
}, measurementMediaService.upload.bind(measurementMediaService));
router.get("/:assetId", measurementMediaService.fetch.bind(measurementMediaService));

export default router;
