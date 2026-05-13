import express from "express";
import JobsController from "./jobs.controller.js";

const router = express.Router();

router
  .route("/mock")
  .post(JobsController.mockCreateJobs)
  .delete(JobsController.mockDeleteAllJobs);

export default router;
