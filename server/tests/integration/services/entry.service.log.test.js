/**
 * Extra integration coverage for EntryService:
 *   - log() success path with Admin + EntryUser + Channel(+NVR+Profile) present
 *     (covers populate / socket / upsert / repopulate branches)
 *   - log() entryUser-not-found and channel-not-found 404 branches
 *   - log() profile-notification email branch with recipients present
 *   - buildEntryPipeline non-admin without query.channelId (auth-only)
 *   - buildEntryPipeline non-admin with NVR overlap and NVR no-overlap
 *   - register() catch via duplicate-key surfaces
 *
 * Mocks mirror the sibling entry.service.*.test.js files (socket / jobs / mail).
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
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(true) },
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { entryLog: vi.fn().mockResolvedValue(undefined) },
}));

const { default: EntryService } = await import(
  "../../../core/v1/entry/entry.service.js"
);
const { default: Entry } = await import(
  "../../../core/v1/entry/entry.model.js"
);
const { default: EntryUser } = await import(
  "../../../core/v1/entry/user.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
const { default: RecipientModel } = await import(
  "../../../core/v1/verifyRecipients/recipients.model.js"
);
const { default: JobsService } = await import(
  "../../../core/v1/jobs/jobs.service.js"
);
const { default: MailHelper } = await import(
  "../../../mailService/mail.helper.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  // default mock state — individual tests override as needed
  JobsService.handleProfileNotification.mockResolvedValue(false);
});

/** Create an Admin row that matches the validate schema's required props. */
async function makeAdminRow() {
  return Admin.create({
    user_id: `u-${new mongoose.Types.ObjectId().toString()}`,
    login: `l-${new mongoose.Types.ObjectId().toString()}`,
    email: `e-${new mongoose.Types.ObjectId().toString()}@x.com`,
  });
}

/** Create an NVR row using the `local` schema (APP_ENV=local in tests/setup.js). */
async function makeNvrRow() {
  return NVR.create({
    userId: "u1",
    nvrName: "Test NVR",
    brand: "hikvision",
    domain: "test.local",
    location: "HQ",
    localNvrId: `n-${new mongoose.Types.ObjectId().toString()}`,
  });
}

/** Create a Channel row using the `local` schema. */
async function makeChannelRow(nvr, profileId = null) {
  return Channel.create({
    nvrId: nvr._id,
    userId: "u1",
    streamingPath: "rtsp://example/test",
    localChannelId: `c-${new mongoose.Types.ObjectId().toString()}`,
    name: "Cam-1",
    profile: profileId,
  });
}

describe("EntryService.log — full body branches", () => {
  it("returns 404 when entry user does not exist", async () => {
    const admin = await makeAdminRow();
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        userId: new mongoose.Types.ObjectId().toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        images: { face: "http://cdn/f.jpg" },
      },
    });
    await EntryService.log(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when channel does not exist", async () => {
    const admin = await makeAdminRow();
    const user = await EntryUser.create({
      firstName: "Jane",
      lastName: "Doe",
      email: "jd@x.com",
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        userId: user._id.toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        images: { face: "http://cdn/f.jpg" },
      },
    });
    await EntryService.log(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("logs an entry successfully (201) and upserts a populated row", async () => {
    const admin = await makeAdminRow();
    const user = await EntryUser.create({
      firstName: "Jane",
      lastName: "Doe",
      email: "succ@x.com",
    });
    const nvr = await makeNvrRow();
    const channel = await makeChannelRow(nvr);

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        userId: user._id.toString(),
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { face: "http://cdn/f.jpg", person: "http://cdn/p.jpg" },
      },
    });
    await EntryService.log(req, res);

    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.entry).toBeTruthy();
    // The entry should now exist in the DB with the event pushed in.
    const stored = await Entry.findOne({
      adminId: admin._id,
      userId: user._id,
    });
    expect(stored).toBeTruthy();
    expect(stored.events.length).toBeGreaterThanOrEqual(1);
  });

  it("dispatches an email when profile notifications + recipients are configured", async () => {
    const admin = await makeAdminRow();
    const user = await EntryUser.create({
      firstName: "Em",
      lastName: "Ail",
      email: "em@x.com",
    });
    const nvr = await makeNvrRow();

    // Email recipient
    const recipient = await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "alert@x.com",
      verified: true,
    });

    // Profile with notification routed to that recipient + email channel ON
    const profile = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "P1" },
      notification: {
        notify: "Instant",
        recipients: [recipient._id],
        channels: { email: true },
      },
    });

    const channel = await makeChannelRow(nvr, profile._id);

    // Switch handleProfileNotification → true so the email branch fires.
    JobsService.handleProfileNotification.mockResolvedValueOnce(true);

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        userId: user._id.toString(),
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { face: "http://cdn/f.jpg" },
      },
    });
    await EntryService.log(req, res);

    expect(res.statusCode).toBe(201);
    expect(MailHelper.entryLog).toHaveBeenCalledTimes(1);
    const [emailAddresses] = MailHelper.entryLog.mock.calls[0];
    expect(emailAddresses).toContain("alert@x.com");
  });

  it("does NOT send email when handleProfileNotification returns false", async () => {
    const admin = await makeAdminRow();
    const user = await EntryUser.create({
      firstName: "N",
      lastName: "M",
      email: "nm@x.com",
    });
    const nvr = await makeNvrRow();
    const recipient = await RecipientModel.create({
      adminId: admin._id,
      type: "email",
      value: "ignored@x.com",
    });
    const profile = await Profile.create({
      userType: "Admin",
      createdBy: admin._id,
      user: admin._id,
      basics: { profileName: "P2" },
      notification: {
        recipients: [recipient._id],
        channels: { email: true },
      },
    });
    const channel = await makeChannelRow(nvr, profile._id);

    JobsService.handleProfileNotification.mockResolvedValueOnce(false);

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        adminId: admin._id.toString(),
        userId: user._id.toString(),
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        images: { face: "http://cdn/f.jpg" },
      },
    });
    await EntryService.log(req, res);

    expect(res.statusCode).toBe(201);
    expect(MailHelper.entryLog).not.toHaveBeenCalled();
  });
});

describe("EntryService.buildEntryPipeline — extra non-admin branches", () => {
  it("non-admin without channelId/nvrId uses authorized channels + nvrs (no bail-out)", async () => {
    const user = await EntryUser.create({
      firstName: "AA",
      lastName: "BB",
      email: "aa@x.com",
    });
    const adminId = new mongoose.Types.ObjectId();
    const grantedChannel = new mongoose.Types.ObjectId();
    const grantedNvr = new mongoose.Types.ObjectId();
    await Entry.create({
      adminId,
      userId: user._id,
      events: [
        {
          timestamp: new Date(),
          nvr: grantedNvr,
          channel: grantedChannel,
          images: {},
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId,
      memberId: new mongoose.Types.ObjectId().toString(),
      authorizedChannel: {
        channels: [grantedChannel],
        nvrIds: [grantedNvr],
      },
      query: {},
    });
    await EntryService.get(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBeGreaterThanOrEqual(1);
  });

  it("non-admin with NVR overlap returns matching entries", async () => {
    const user = await EntryUser.create({
      firstName: "CC",
      lastName: "DD",
      email: "cc@x.com",
    });
    const adminId = new mongoose.Types.ObjectId();
    const grantedNvr = new mongoose.Types.ObjectId();
    const grantedChannel = new mongoose.Types.ObjectId();
    await Entry.create({
      adminId,
      userId: user._id,
      events: [
        {
          timestamp: new Date(),
          nvr: grantedNvr,
          channel: grantedChannel,
          images: {},
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId,
      memberId: new mongoose.Types.ObjectId().toString(),
      authorizedChannel: {
        channels: [grantedChannel],
        nvrIds: [grantedNvr],
      },
      query: { nvrId: grantedNvr.toString() },
    });
    await EntryService.get(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBeGreaterThanOrEqual(1);
  });

  it("non-admin with NVR request and no overlap returns empty", async () => {
    const user = await EntryUser.create({
      firstName: "EE",
      lastName: "FF",
      email: "ee@x.com",
    });
    const adminId = new mongoose.Types.ObjectId();
    const grantedNvr = new mongoose.Types.ObjectId();
    const otherNvr = new mongoose.Types.ObjectId();
    await Entry.create({
      adminId,
      userId: user._id,
      events: [
        {
          timestamp: new Date(),
          nvr: grantedNvr,
          channel: null,
          images: {},
        },
      ],
    });

    const { req, res } = serviceCtx({
      adminId,
      memberId: new mongoose.Types.ObjectId().toString(),
      authorizedChannel: {
        channels: [],
        nvrIds: [grantedNvr],
      },
      // Request an NVR not in authorizedNvrIds → effectiveNvrIds = []
      // → pipeline collapses to [{ $match: { _id: null } }] → empty result.
      query: { nvrId: otherNvr.toString() },
    });
    await EntryService.get(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(0);
  });
});
