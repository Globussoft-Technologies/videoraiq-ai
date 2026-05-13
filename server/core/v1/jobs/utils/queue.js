import { Queue } from "bullmq";
import { redis } from "../../../../utils/database.js";

export const scheduleQueue = new Queue("schedule-queue", {
  connection: redis,
});
