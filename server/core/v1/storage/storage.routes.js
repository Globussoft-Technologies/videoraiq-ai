import express from "express";
import storageController from "./storage.controller.js";
import multer from "multer";
import verifyToken from "../../../middlewares/verifyToken.js";

const router = express.Router();

const upload = multer({ dest: "incidentUploads/" });

router
  .route("/")
  .all(verifyToken)
  .get(storageController.getStorages)
  .post(storageController.addStorage);

router.post("/upload", upload.single("file"), storageController.uploadFile);

router.put("/activate", verifyToken, storageController.activateStorage);

router.get("/get/:path(*)", storageController.smartStreamFile);

router.get("/stream/:id", storageController.streamFile);

router.get("/auth/google/callback", storageController.googleAuthCallback);

router
  .route("/:id")
  .all(verifyToken)
  .put(storageController.updateStorage)
  .delete(storageController.deleteStorage);

export default router;
