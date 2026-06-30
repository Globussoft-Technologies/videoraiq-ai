import { Queue } from "bullmq";
import { redis } from "../../../../utils/database.js";

export const deletionQueue = new Queue("deletion-queue", {
  connection: redis,
});
