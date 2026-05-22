/**
 * Unit tests for core/v1/jobs/utils/scheduleJobs.js
 *
 * The module talks to a BullMQ Queue via `./queue.js`. We mock that module
 * so the tests run with zero external deps. Single mock — well under the
 * 8-mock ceiling.
 *
 * Targets the helpers behind `createJobsForNextDays`:
 *   - WEEK_DAYS_MAP lookup + skip-unknown-day branch
 *   - skip empty / missing slot arrays
 *   - midnight-crossing (endTime < startTime → stopDayIndex rolls over)
 *   - removeExistingJobs scrubs old recurring jobs for the same schedule
 *   - the cron string is built from "HH:MM" + dayIndex
 *   - the jobId stamps in the schedule id, action, day, and HHMM
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";

// Mock queue.js: scheduleQueue is the only export the module uses.
const addMock = vi.fn();
const getJobsMock = vi.fn();
const removeJobSchedulerMock = vi.fn();

vi.mock("../../../core/v1/jobs/utils/queue.js", () => ({
  scheduleQueue: {
    add: (...args) => addMock(...args),
    getJobs: (...args) => getJobsMock(...args),
    removeJobScheduler: (...args) => removeJobSchedulerMock(...args),
  },
}));

const { createJobsForNextDays } = await import(
  "../../../core/v1/jobs/utils/scheduleJobs.js"
);

beforeEach(() => {
  addMock.mockReset();
  getJobsMock.mockReset();
  removeJobSchedulerMock.mockReset();
  // Default: no existing jobs so removeExistingJobs is a no-op.
  getJobsMock.mockResolvedValue([]);
});

const baseSchedule = (over = {}) => ({
  _id: { toString: () => "sched-1" },
  user: "user-1",
  basics: {
    timeZone: "Asia/Kolkata",
    days: {
      monday: [{ startTime: "09:00", endTime: "17:00" }],
    },
  },
  notification: {},
  ...over,
});

describe("createJobsForNextDays", () => {
  it("schedules a START + STOP for a same-day slot", async () => {
    await createJobsForNextDays(baseSchedule());
    expect(addMock).toHaveBeenCalledTimes(2);
    // Inspect the START call.
    const [startAction, startData, startOpts] = addMock.mock.calls[0];
    expect(startAction).toBe("START");
    expect(startData.action).toBe("START");
    expect(startData.scheduleId).toEqual({ toString: expect.any(Function) });
    expect(startData.userId).toBe("user-1");
    expect(startData.dayIndex).toBe(1); // monday
    expect(startData.timeZone).toBe("Asia/Kolkata");
    expect(startData.expectedRunAt).toBe("09:00");
    // cron pattern: "MM HH * * D" → "00 09 * * 1"
    expect(startOpts.repeat.pattern).toBe("00 09 * * 1");
    expect(startOpts.repeat.tz).toBe("Asia/Kolkata");
    expect(startOpts.jobId).toBe("sched-1_START_1_0900");
    expect(startOpts.removeOnComplete).toBe(true);
    expect(startOpts.removeOnFail).toBe(true);
    expect(startOpts.attempts).toBe(3);
    expect(startOpts.backoff).toEqual({ type: "exponential", delay: 5000 });

    const [stopAction, stopData, stopOpts] = addMock.mock.calls[1];
    expect(stopAction).toBe("STOP");
    expect(stopData.dayIndex).toBe(1); // still monday — no roll-over
    expect(stopOpts.repeat.pattern).toBe("00 17 * * 1");
    expect(stopOpts.jobId).toBe("sched-1_STOP_1_1700");
  });

  it("rolls STOP forward by one day when the slot crosses midnight", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            friday: [{ startTime: "23:00", endTime: "01:00" }],
          },
        },
      }),
    );
    // friday is index 5 → stop on saturday (6)
    const [, startData] = addMock.mock.calls[0];
    const [, stopData] = addMock.mock.calls[1];
    expect(startData.dayIndex).toBe(5);
    expect(stopData.dayIndex).toBe(6);
  });

  it("rolls STOP from Saturday over to Sunday (wrap to 0)", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            saturday: [{ startTime: "23:00", endTime: "01:00" }],
          },
        },
      }),
    );
    const [, startData] = addMock.mock.calls[0];
    const [, stopData] = addMock.mock.calls[1];
    expect(startData.dayIndex).toBe(6);
    expect(stopData.dayIndex).toBe(0); // (6 + 1) % 7
  });

  it("skips unknown day names (e.g. 'someday')", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            someday: [{ startTime: "09:00", endTime: "17:00" }],
            tuesday: [{ startTime: "08:00", endTime: "12:00" }],
          },
        },
      }),
    );
    // Only the tuesday pair should be scheduled.
    expect(addMock).toHaveBeenCalledTimes(2);
    expect(addMock.mock.calls[0][1].dayIndex).toBe(2); // tuesday
  });

  it("skips empty / null slot arrays", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            monday: [],
            tuesday: null,
            wednesday: [{ startTime: "06:30", endTime: "07:00" }],
          },
        },
      }),
    );
    expect(addMock).toHaveBeenCalledTimes(2);
    expect(addMock.mock.calls[0][1].dayIndex).toBe(3); // wednesday
    expect(addMock.mock.calls[0][2].repeat.pattern).toBe("30 06 * * 3");
  });

  it("handles multiple slots per day", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            monday: [
              { startTime: "06:00", endTime: "10:00" },
              { startTime: "14:00", endTime: "18:00" },
            ],
          },
        },
      }),
    );
    // 2 slots × (START + STOP) = 4 add() calls.
    expect(addMock).toHaveBeenCalledTimes(4);
    const jobIds = addMock.mock.calls.map((c) => c[2].jobId);
    expect(jobIds).toEqual([
      "sched-1_START_1_0600",
      "sched-1_STOP_1_1000",
      "sched-1_START_1_1400",
      "sched-1_STOP_1_1800",
    ]);
  });

  it("is case-insensitive for day-name keys", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            THURSDAY: [{ startTime: "09:00", endTime: "10:00" }],
          },
        },
      }),
    );
    expect(addMock).toHaveBeenCalledTimes(2);
    expect(addMock.mock.calls[0][1].dayIndex).toBe(4); // thursday
  });

  it("removes existing repeatable jobs for the same schedule before adding new ones", async () => {
    getJobsMock.mockResolvedValue([
      {
        data: { scheduleId: "sched-1" },
        repeatJobKey: "old-key-1",
      },
      {
        data: { scheduleId: "sched-2" },
        repeatJobKey: "other-key",
      },
      {
        data: { scheduleId: "sched-1" },
        repeatJobKey: undefined, // no repeatJobKey → should be skipped
      },
    ]);

    await createJobsForNextDays(baseSchedule());

    expect(getJobsMock).toHaveBeenCalledWith(["delayed", "waiting", "active"]);
    // Only "sched-1" with a repeatJobKey should be removed.
    expect(removeJobSchedulerMock).toHaveBeenCalledTimes(1);
    expect(removeJobSchedulerMock).toHaveBeenCalledWith("old-key-1");
    // And the new START/STOP pair still got added.
    expect(addMock).toHaveBeenCalledTimes(2);
  });

  it("does not add anything when every day's slot list is empty", async () => {
    await createJobsForNextDays(
      baseSchedule({
        basics: {
          timeZone: "UTC",
          days: {
            monday: [],
            tuesday: [],
          },
        },
      }),
    );
    expect(addMock).not.toHaveBeenCalled();
  });
});
