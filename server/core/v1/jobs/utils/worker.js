import { Worker } from "bullmq";
import { redis } from "../../../../utils/database.js";
import { getDelayMinutes, getExpectedRunAt } from "./time.util.js";

const MAX_DELAY_MINUTES = 5;

console.log("Worker started for schedule-queue");

const worker = new Worker(
  "schedule-queue",
  async (job) => {
    const { action, expectedRunAt, timeZone, dayIndex } = job.data;

    // Compute expected wall-clock time for *today*
    const expectedTime = getExpectedRunAt(expectedRunAt, timeZone, dayIndex);

    const delayMinutes = getDelayMinutes(expectedTime);


    // Skip stale jobs
    if (action === "START" && delayMinutes > MAX_DELAY_MINUTES) {
      console.warn(
        `⏭️ Skipping stale job ${job.id} | action=${
          job.data.action
        } | delayed ${delayMinutes.toFixed(2)} min`
      );
      return;
    }

    // ✅ Safe to execute

    if (action === "START") {
      await callStartAPI(job.data);
    } else {
      await callStopAPI(job.data);
    }
  },
  { connection: redis, concurrency: 5 }
);

worker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});

async function callStartAPI(payload) {
  console.log("▶️ START API", payload);
}

async function callStopAPI(payload) {
  console.log("⏹️ STOP API", payload);
}
