import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn(),
    handleDetectionUpdate: vi.fn(),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

const { default: ChannelsService } = await import(
  "../../../core/v2/channels/channels.service.js"
);
const { default: AgentActionsService } = await import(
  "../../../core/v2/agentActions/agentActions.service.js"
);
const { default: AgentDataService } = await import(
  "../../../core/v2/agentData/agentData.service.js"
);
const { AgentOneTimeSchedule } = await import(
  "../../../core/v2/agentData/agentData.model.js"
);
const { runOneTimeScheduleTick } = await import(
  "../../../core/v2/agentData/oneTimeSchedule.service.js"
);
const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { CountPersonsDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { FireSmokeDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);

/**
 * Enabling a detection now goes through the licensing gate
 * (core/v2/clientConfig/detectionLicense.service.js): the client needs a camera
 * licence and an allocation for the detection type, otherwise the toggle is
 * refused with 403. Give the tenant enough headroom that these tests exercise
 * the threshold behaviour rather than the limits.
 */
async function licensedAdmin(userId, settingTypes) {
  const admin = await Admin.create({
    user_id: userId,
    login: `admin-${userId}`,
    email: `admin-${userId}@test.com`,
    purchasedCameras: 10,
  });
  await DetectionAllocation.insertMany(
    settingTypes.map((settingType) => ({
      adminId: admin._id,
      settingType,
      enabled: true,
      cameraAllocation: 10,
    }))
  );
  return admin;
}

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
});

describe("v2 ChannelsService.toggleDetection model thresholds", () => {
  it("rejects overlapping overnight schedule windows before creating an action", async () => {
    const { req, res } = serviceCtx({
      body: {
        operation: "camera_schedule_update", targets: [{}], idempotencyKey: "invalid-overnight",
        after: { schedule: { mode: "custom", days: { monday: [{ start: "22:00", end: "08:00" }], tuesday: [{ start: "07:00", end: "09:00" }] } } },
      },
    });
    await AgentActionsService.prepare(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).errorCode).toBe("INVALID_SCHEDULE");
  });
  it("records disabled only after the scheduled disable succeeds", async () => {
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/101",
      localChannelId: "1", name: "Scheduled Camera", isAdded: true,
      detections: { countPersonsSettings: { id: new mongoose.Types.ObjectId(), enabled: true } },
    });
    const schedule = await AgentOneTimeSchedule.create({
      accountId: new mongoose.Types.ObjectId(), actionId: new mongoose.Types.ObjectId(),
      channelId: channel._id, detectionType: "countPersonsSettings", restoreEnabled: true,
      disableAt: new Date("2026-10-16T10:00:00Z"), restoreAt: new Date("2099-01-01T11:00:00Z"),
      expectedConfigurationVersion: String(channel.configurationVersion ?? 0), status: "approved",
    });
    const toggle = vi.spyOn(ChannelsService, "toggleDetection").mockImplementation(async (req, res) => {
      const row = await Channel.findById(req.body.channelId);
      row.detections.countPersonsSettings.enabled = req.body.enable;
      await row.save();
      return res.status(200).json({ body: { status: "success" } });
    });
    try {
      await runOneTimeScheduleTick(new Date("2026-10-16T10:00:30Z"));
      const updated = await AgentOneTimeSchedule.findById(schedule._id).lean();
      expect(updated.status).toBe("executing");
      expect(updated.executionHistory.map((entry) => entry.status)).toEqual(["disable_started", "disabled"]);
      expect(updated.executionHistory[1].observedVersion).toBe(String(updated.disableObservedVersion));
    } finally { toggle.mockRestore(); }
  });
  it("restores a camera-wide temporary disable", async () => {
    const accountId = new mongoose.Types.ObjectId();
    const actionId = new mongoose.Types.ObjectId();
    const camera = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/103",
      localChannelId: "3", name: "Camera-wide schedule", isAdded: true, control: 1,
      detections: { countPersonsSettings: { id: new mongoose.Types.ObjectId(), enabled: true } },
    });
    const schedule = await AgentOneTimeSchedule.create({
      accountId, actionId, channelId: camera._id, detectionType: "__camera__", restoreEnabled: true,
      disableAt: new Date("2026-10-16T10:00:00Z"), restoreAt: new Date("2026-10-16T11:00:00Z"),
      expectedConfigurationVersion: String(camera.configurationVersion ?? 0), status: "approved",
    });
    const update = vi.spyOn(ChannelsService, "updateChannel").mockImplementation(async (req, res) => {
      await Channel.updateOne({ _id: req.params.id }, { $set: { control: req.body.control }, $inc: { configurationVersion: 1 } });
      return res.status(200).json({ body: { status: "success" } });
    });
    try {
      await runOneTimeScheduleTick(new Date("2026-10-16T10:00:30Z"));
      expect((await AgentOneTimeSchedule.findById(schedule._id)).status).toBe("executing");
      await runOneTimeScheduleTick(new Date("2026-10-16T11:00:30Z"));
      expect((await AgentOneTimeSchedule.findById(schedule._id)).status).toBe("restored");
      expect((await Channel.findById(camera._id)).control).toBe(1);
    } finally { update.mockRestore(); }
  });
  it("does not re-enable a detector that was disabled before a temporary schedule", async () => {
    const camera = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/104",
      localChannelId: "4", name: "Disabled detector", isAdded: true,
      detections: { countPersonsSettings: { id: new mongoose.Types.ObjectId(), enabled: false } },
    });
    const schedule = await AgentOneTimeSchedule.create({
      accountId: new mongoose.Types.ObjectId(), actionId: new mongoose.Types.ObjectId(),
      channelId: camera._id, detectionType: "countPersonsSettings", restoreEnabled: false,
      disableAt: new Date("2026-10-16T10:00:00Z"), restoreAt: new Date("2026-10-16T11:00:00Z"),
      expectedConfigurationVersion: String(camera.configurationVersion ?? 0), status: "approved",
    });
    const toggle = vi.spyOn(ChannelsService, "toggleDetection").mockImplementation(async (req, res) => {
      const row = await Channel.findById(req.body.channelId);
      row.detections.countPersonsSettings.enabled = req.body.enable;
      row.configurationVersion = (row.configurationVersion || 0) + 1;
      await row.save();
      return res.status(200).json({ body: { status: "success" } });
    });
    try {
      await runOneTimeScheduleTick(new Date("2026-10-16T10:00:30Z"));
      await runOneTimeScheduleTick(new Date("2026-10-16T11:00:30Z"));
      expect((await AgentOneTimeSchedule.findById(schedule._id)).status).toBe("restored");
      expect((await Channel.findById(camera._id)).detections.countPersonsSettings.enabled).toBe(false);
      expect(toggle).not.toHaveBeenCalled();
    } finally { toggle.mockRestore(); }
  });
  it("captures the original state and filters one-time schedules by actionId", async () => {
    const account = new mongoose.Types.ObjectId();
    const setting = await CountPersonsDetectionSetting.create({
      userId: "22", settingType: "countPersonsSettings", name: "People count",
      enabled: true, settings: { metricType: "counter" },
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/101",
      localChannelId: "1", name: "Camera", isAdded: true,
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });
    const { req, res } = serviceCtx({
      adminId: account, user_id: "22",
      body: { operation: "one_time_restore", targets: [{ channelId: String(channel._id), detectionType: "countPersonsSettings" }], after: { disableAt: "2099-01-01T10:00:00Z", restoreAt: "2099-01-01T11:00:00Z", timezone: "UTC" }, idempotencyKey: "restore-original-state" },
    });
    req.header = req.get.bind(req);
    await AgentActionsService.prepare(req, res);
    expect(res.statusCode).toBe(201);
    const actionId = payload(res).data.actionId;
    const schedule = await AgentOneTimeSchedule.findOne({ actionId }).lean();
    expect(schedule.restoreEnabled).toBe(false);
    const proposal = payload(res).data;
    const approval = serviceCtx({
      adminId: account, user_id: "22", params: { actionId },
      body: { proposalVersion: proposal.proposalVersion, digest: proposal.digest, decision: "approve", idempotencyKey: "approve-original-state" },
    });
    approval.req.header = approval.req.get.bind(approval.req);
    await AgentActionsService.decision(approval.req, approval.res);
    expect(approval.res.statusCode).toBe(200);
    expect((await AgentOneTimeSchedule.findOne({ actionId })).status).toBe("planned");
    const execution = serviceCtx({
      adminId: account, user_id: "22", params: { actionId },
      body: { proposalVersion: proposal.proposalVersion, digest: proposal.digest, idempotencyKey: "execute-original-state" },
    });
    execution.req.header = execution.req.get.bind(execution.req);
    await AgentActionsService.execute(execution.req, execution.res);
    expect(execution.res.statusCode).toBe(200);
    expect((await AgentOneTimeSchedule.findOne({ actionId })).status).toBe("approved");
    const history = serviceCtx({ adminId: account, query: { actionId } });
    history.req.header = history.req.get.bind(history.req);
    await AgentDataService.list(history.req, history.res, "schedules");
    expect(history.res.statusCode).toBe(200);
    expect(payload(history.res).data.total).toBe(1);
    expect(String(payload(history.res).data.items[0].actionId)).toBe(actionId);
  });
  it("rejects a shared-setting proposal when another linked camera is outside member scope", async () => {
    const setting = await CountPersonsDetectionSetting.create({
      userId: "22", settingType: "countPersonsSettings", name: "Shared people count",
      enabled: true, settings: { metricType: "counter" },
    });
    const cameras = await Channel.create([
      { nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/101", localChannelId: "1", name: "Allowed", isAdded: true, detections: { countPersonsSettings: { id: setting._id, enabled: true } } },
      { nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/102", localChannelId: "2", name: "Other", isAdded: true, detections: { countPersonsSettings: { id: setting._id, enabled: true } } },
    ]);
    const { req, res } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(), memberId: new mongoose.Types.ObjectId(),
      authorizedChannel: { channels: [cameras[0]._id] },
      permissionConfig: [{ permissionConfig: { channels: { edit: true } } }],
      body: { operation: "camera_configuration_update", targets: [{ channelId: String(cameras[0]._id), detectionType: "countPersonsSettings", settingId: String(setting._id) }], after: { settings: { alertThreshold: 1 } }, idempotencyKey: "shared-out-of-scope" },
    });
    req.header = req.get.bind(req);
    await AgentActionsService.prepare(req, res);
    expect(res.statusCode).toBe(403);
    expect(payload(res).errorCode).toBe("SHARED_SETTING_OUT_OF_SCOPE");
  });
  it("blocks direct agent detector writes without an approved action id", async () => {
    const { req, res, next } = serviceCtx({
      body: { channelId: new mongoose.Types.ObjectId().toString(), detectionType: "countPersonsSettings", enable: false },
    });
    req.verified.userData.credentialType = "agent";
    await ChannelsService.toggleDetection(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(payload(res).error?.code).toBe("AGENT_ACTION_REQUIRED");
  });

  it("blocks direct agent bulk writes", async () => {
    const { req, res, next } = serviceCtx({ body: { ids: [new mongoose.Types.ObjectId().toString()], control: 0 } });
    req.verified.userData.credentialType = "agent";
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(payload(res).error?.code).toBe("AGENT_ACTION_REQUIRED");
  });

  it("increments configurationVersion on a product bulk update", async () => {
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/102",
      localChannelId: "2", name: "Bulk Camera", isAdded: true,
    });
    const { req, res, next } = serviceCtx({ body: { ids: [String(channel._id)], profile: new mongoose.Types.ObjectId().toString() } });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    const updated = await Channel.findById(channel._id).lean();
    expect(updated.configurationVersion).toBe((channel.configurationVersion ?? 0) + 1);
  });

  it("stores DS defaults in modelThresholds without overwriting settings", async () => {
    pythonService.handleDetectionStartStop.mockResolvedValueOnce({
      success: true,
      model_thresholds: {
        countPersonsSettings: {
          person_threshold: 0.37,
        },
      },
    });

    const setting = await CountPersonsDetectionSetting.create({
      userId: "22",
      settingType: "countPersonsSettings",
      name: "People Count",
      enabled: true,
      modelThresholds: {},
      settings: {
        person_threshold: 0.81,
        metricType: "counter",
      },
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "22",
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "Lobby Camera",
      isAdded: true,
      detections: {
        countPersonsSettings: {
          id: setting._id,
          enabled: false,
        },
      },
    });
    const admin = await licensedAdmin("22", ["countPersonsSettings"]);
    const { req, res, next } = serviceCtx({
      user_id: "22",
      adminId: admin._id.toString(),
      body: {
        channelId: channel._id.toString(),
        detectionType: "countPersonsSettings",
        enable: true,
      },
    });

    await ChannelsService.toggleDetection(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).message).toBe("Detection updated successfully");

    const reloadedSetting = await CountPersonsDetectionSetting.findById(setting._id);
    expect(reloadedSetting.modelThresholds).toEqual({
      person_threshold: 0.37,
    });
    expect(reloadedSetting.settings.person_threshold).toBe(0.81);
  });
});

describe("v2 DetectionSettingsService model thresholds", () => {
  it("reports reset availability and a stable refusal code", async () => {
    const setting = await CountPersonsDetectionSetting.create({
      userId: "22", settingType: "countPersonsSettings", name: "No saved thresholds",
      enabled: false, settings: { metricType: "gauge" },
    });
    const read = serviceCtx({ user_id: "22", params: { id: String(setting._id) } });
    await DetectionSettingsService.getDetectionSettings(read.req, read.res);
    expect(payload(read.res).data.detectionSetting.hasSavedModelThresholds).toBe(false);

    const reset = serviceCtx({ user_id: "22", params: { id: String(setting._id) } });
    await DetectionSettingsService.resetDetectionThresholds(reset.req, reset.res);
    expect(reset.res.statusCode).toBe(400);
    expect(payload(reset.res).errorCode).toBe("NO_SAVED_THRESHOLDS");
  });

  it("refreshes modelThresholds when an enabled setting is updated", async () => {
    pythonService.handleDetectionUpdate.mockResolvedValueOnce({
      success: true,
      model_thresholds: {
        countPersonsSettings: {
          person_threshold: 0.44,
        },
      },
    });

    const setting = await CountPersonsDetectionSetting.create({
      userId: "22",
      settingType: "countPersonsSettings",
      name: "People Count",
      enabled: true,
      modelThresholds: {
        person_threshold: 0.37,
      },
      settings: {
        person_threshold: 0.81,
        metricType: "gauge",
      },
    });
    await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "22",
      streamingPath: "/Streaming/Channels/102",
      localChannelId: "2",
      name: "Entrance Camera",
      isAdded: true,
      detections: {
        countPersonsSettings: {
          id: setting._id,
          enabled: true,
        },
      },
    });
    const admin = await licensedAdmin("22", ["countPersonsSettings"]);
    const { req, res, next } = serviceCtx({
      user_id: "22",
      adminId: admin._id.toString(),
      params: { id: setting._id.toString() },
      body: {
        settings: {
          metricType: "counter",
        },
      },
    });

    await DetectionSettingsService.updateDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(pythonService.handleDetectionUpdate).toHaveBeenCalledTimes(1);

    const reloadedSetting = await CountPersonsDetectionSetting.findById(setting._id);
    expect(reloadedSetting.modelThresholds).toEqual({
      person_threshold: 0.44,
    });
    expect(reloadedSetting.settings.person_threshold).toBe(0.81);
    expect(reloadedSetting.settings.metricType).toBe("counter");
  });
});

describe("agent configuration update", () => {
  it("enables a scheduled detector immediately when switching back to always", async () => {
    const admin = await licensedAdmin("22", ["fireSmokeDetectionSettings"]);
    const setting = await FireSmokeDetectionSetting.create({
      userId: "22", settingType: "fireSmokeDetectionSettings", name: "Scheduled fire",
      enabled: true, settings: { alertThreshold: 1 },
    });
    const camera = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/105",
      localChannelId: "5", name: "Scheduled fire camera", isAdded: true,
      detections: { fireSmokeDetectionSettings: { id: setting._id, enabled: false,
        schedule: { mode: "custom", timezone: "Asia/Kolkata", days: { monday: [{ start: "09:00", end: "18:00" }] } } } },
    });
    const toggle = vi.spyOn(ChannelsService, "toggleDetection").mockImplementation(async (req, res) => {
      const row = await Channel.findById(req.body.channelId);
      row.detections.fireSmokeDetectionSettings.enabled = req.body.enable;
      await row.save();
      return res.status(200).json({ body: { status: "success" } });
    });
    try {
      const prepare = serviceCtx({ adminId: admin._id, user_id: "22",
        body: { operation: "camera_schedule_update", idempotencyKey: "restore-always",
          targets: [{ channelId: String(camera._id), detectionType: "fireSmokeDetectionSettings", settingId: String(setting._id) }],
          after: { schedule: { mode: "always" } } } });
      prepare.req.verified.userData.timezone = "Asia/Kolkata";
      prepare.req.header = prepare.req.get.bind(prepare.req);
      await AgentActionsService.prepare(prepare.req, prepare.res);
      expect(prepare.res.statusCode).toBe(201);
      const proposal = payload(prepare.res).data;
      expect(proposal.targets[0].after.enabled).toBe(true);

      const approval = serviceCtx({ adminId: admin._id, user_id: "22", params: { actionId: proposal.actionId },
        body: { proposalVersion: proposal.proposalVersion, digest: proposal.digest, decision: "approve", idempotencyKey: "approve-always" } });
      approval.req.header = approval.req.get.bind(approval.req);
      await AgentActionsService.decision(approval.req, approval.res);
      const execution = serviceCtx({ adminId: admin._id, user_id: "22", params: { actionId: proposal.actionId },
        body: { proposalVersion: proposal.proposalVersion, digest: proposal.digest, idempotencyKey: "execute-always" } });
      execution.req.header = execution.req.get.bind(execution.req);
      await AgentActionsService.execute(execution.req, execution.res);
      expect(payload(execution.res).data.status).toBe("completed");
      expect(toggle).toHaveBeenCalledOnce();
      const updated = await Channel.findById(camera._id).lean();
      expect(updated.detections.fireSmokeDetectionSettings.enabled).toBe(true);
      expect(updated.detections.fireSmokeDetectionSettings.schedule.mode).toBe("always");
    } finally { toggle.mockRestore(); }
  });

  it("keeps the configuration version stable during snapshot refresh", async () => {
    const camera = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/104",
      localChannelId: "4", name: "Snapshot camera", isAdded: true,
    });
    const version = camera.configurationVersion ?? 0;
    await Channel.findOneAndUpdate({ _id: camera._id }, { $set: { snapshotLeaseToken: "lease", snapshotNextAttemptAt: new Date() } });
    await Channel.updateOne({ _id: camera._id }, { $set: { latestSnapshot: { path: "snapshot.jpg", capturedAt: new Date(), source: "live" } } });
    expect((await Channel.findById(camera._id)).configurationVersion).toBe(version);
    await Channel.updateOne({ _id: camera._id }, { $set: { customName: "Renamed" } });
    expect((await Channel.findById(camera._id)).configurationVersion).toBe(version + 1);
  });

  it("executes an approved partial fire and smoke settings update", async () => {
    const admin = await licensedAdmin("22", ["fireSmokeDetectionSettings"]);
    const setting = await FireSmokeDetectionSetting.create({
      userId: "22", settingType: "fireSmokeDetectionSettings", name: "Fire and smoke",
      enabled: true, settings: { alertThreshold: 1 },
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: "22", streamingPath: "/Streaming/Channels/101",
      localChannelId: "1", name: "TB-09-Cam-01", isAdded: true,
      detections: { fireSmokeDetectionSettings: { id: setting._id, enabled: true } },
    });
    const prepare = serviceCtx({
      adminId: admin._id, user_id: "22",
      body: { operation: "camera_configuration_update", idempotencyKey: "partial-fire-settings",
        targets: [{ channelId: String(channel._id), detectionType: "fireSmokeDetectionSettings", settingId: String(setting._id) }],
        after: { settings: { alertThreshold: 2 }, enabled: true } },
    });
    prepare.req.header = prepare.req.get.bind(prepare.req);
    await AgentActionsService.prepare(prepare.req, prepare.res);
    expect(prepare.res.statusCode).toBe(201);
    const proposal = payload(prepare.res).data;

    const approval = serviceCtx({ adminId: admin._id, user_id: "22", params: { actionId: proposal.actionId },
      body: { proposalVersion: proposal.proposalVersion, digest: proposal.digest, decision: "approve", idempotencyKey: "approve-fire" } });
    approval.req.header = approval.req.get.bind(approval.req);
    await AgentActionsService.decision(approval.req, approval.res);
    expect(approval.res.statusCode).toBe(200);

    const execution = serviceCtx({ adminId: admin._id, user_id: "22", params: { actionId: proposal.actionId },
      body: { proposalVersion: proposal.proposalVersion, digest: proposal.digest, idempotencyKey: "execute-fire" } });
    execution.req.header = execution.req.get.bind(execution.req);
    await AgentActionsService.execute(execution.req, execution.res);
    expect(execution.res.statusCode).toBe(200);
    expect(payload(execution.res).data.status).toBe("completed");
    expect((await FireSmokeDetectionSetting.findById(setting._id)).settings.alertThreshold).toBe(2);
  });
});
