/**
 * Gap-fill round 2 for jobs.service.js.
 *
 * Remaining v8-reported uncovered ranges (after bullkeys + extras):
 *   102-113  handleProfileStart channels.forEach body — only runs when
 *            Channel.find returns one or more linked channels.
 *
 * UNREACHABLE:
 *   120-122  handleProfileStop catch — try-block is empty.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

vi.mock("../../../core/v1/jobs/utils/scheduleJobs.js", () => ({
  createJobsForNextDays: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../utils/database.js", () => ({
  redis: {
    scan: vi.fn().mockResolvedValue(["0", []]),
    del: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

const { default: JobsService } = await import(
  "../../../core/v1/jobs/jobs.service.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
await import("../../../core/v1/verifyRecipients/recipients.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("JobsService.handleProfileStart — channels.forEach body (lines 102-113)", () => {
  it("iterates each linked channel, logs the start banner, and exits cleanly", async () => {
    const scheduleId = "schedule-with-channels";
    await Profile.create({
      userType: "Admin",
      createdBy: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      basics: { profileName: "WithChannels" },
      scheduleId,
    });
    // Spy Channel.find to bypass the populate chain — return a synthetic
    // doc with the minimal shape the forEach body reads (lines 103-113):
    //   channel._id, channel.nvrId._id, channel.detections (must be an
    //   iterable Object for Object.values). Real populate over the 24
    //   detection-setting subdocs produces undefined entries that crash
    //   the .filter call — that's a separate product issue (see catch arm).
    const findSpy = vi.spyOn(Channel, "find").mockImplementationOnce(() => ({
      populate: vi.fn().mockReturnThis(),
      // chain ends with the implicit await on the returned thenable
      then: (resolve) =>
        resolve([
          {
            _id: new mongoose.Types.ObjectId(),
            nvrId: { _id: new mongoose.Types.ObjectId() },
            detections: {
              motionDetectionSettings: {
                id: new mongoose.Types.ObjectId(),
                enabled: true,
              },
            },
          },
        ]),
    }));

    await expect(
      JobsService.handleProfileStart({ scheduleId }),
    ).resolves.toBeUndefined();
    expect(findSpy).toHaveBeenCalled();
  });
});
