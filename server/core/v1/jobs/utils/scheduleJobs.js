import { scheduleQueue } from "./queue.js";

const WEEK_DAYS_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Creates recurring jobs (Cron) for the given schedule.
 * Automatically cleans up any existing repeatable jobs for this schedule first.
 */
export async function createJobsForNextDays(scheduleDoc) {
  const { _id: scheduleId, user, basics, notification } = scheduleDoc;
  const { days, timeZone } = basics;

  // Set scheduleId on the profile document to enable job lookups
  scheduleDoc.scheduleId = scheduleId.toString();
  await scheduleDoc.save();

  // 1️⃣ Clear existing recurring jobs for this schedule to avoid duplicates/stale jobs
  await removeExistingJobs(scheduleId);

  // 2️⃣ Create new recurring jobs
  for (const [dayName, slots] of Object.entries(days)) {
    const dayIndex = WEEK_DAYS_MAP[dayName.toLowerCase()];
    if (dayIndex === undefined) continue;

    if (!slots || slots.length === 0) continue;

    for (const slot of slots) {
      const { startTime, endTime } = slot;

      // Schedule START
      await addRecurringJob({
        scheduleId,
        userId: user,
        action: "START",
        dayIndex,
        time: startTime,
        timeZone,
      });

      // Schedule STOP
      // Check if it crosses midnight (e.g. Start 23:00 Fri, End 01:00 Sat)
      let stopDayIndex = dayIndex;
      if (endTime < startTime) {
        stopDayIndex = (dayIndex + 1) % 7;
      }

      await addRecurringJob({
        scheduleId,
        userId: user,
        action: "STOP",
        dayIndex: stopDayIndex,
        time: endTime,
        timeZone,
      });
    }
  }
}

async function removeExistingJobs(scheduleId) {
  const jobs = await scheduleQueue.getJobs(["delayed", "waiting", "active"]);

  for (const job of jobs) {
    if (job?.data?.scheduleId === scheduleId.toString()) {
      const repeatKey = job.repeatJobKey;

      if (repeatKey) {
        // console.log("Removing scheduler:", repeatKey);
        await scheduleQueue.removeJobScheduler(repeatKey);
      }
    }
  }
}

async function addRecurringJob({
  scheduleId,
  userId,
  action,
  dayIndex,
  time,
  timeZone,
}) {
  const [hour, minute] = time.split(":");
  const cron = `${minute} ${hour} * * ${dayIndex}`;

  const safeTime = time.replace(":", "");
  const jobId = `${scheduleId}_${action}_${dayIndex}_${safeTime}`;

  await scheduleQueue.add(
    action,
    { scheduleId, userId, action, expectedRunAt: time, timeZone, dayIndex },
    {
      repeat: {
        pattern: cron,
        tz: timeZone,
      },
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    }
  );
}
