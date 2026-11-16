import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

// Exercise real inventory/history collections; external services stay isolated.
vi.mock("axios", () => ({ default: { delete: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../../utils/database.js", () => ({ redis: { del: vi.fn() } }));
vi.mock("../../../services/apiCache.service.js", () => ({ invalidateApiCache: () => {} }));
vi.mock("../../../utils/mediaStorage.js", () => ({ deleteMedia: vi.fn() }));
vi.mock("../../../utils/rtspStream.js", () => ({
  resolveStream: async () => ({ host: "http://stream.test", token: "test" }),
  isInstallerManaged: nvr => nvr?.managementSource === "installer" || Boolean(nvr?.localNvrId),
}));

const { default: DeleteService } = await import("../../../services/delete.service.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: logger } = await import("../../../utils/logger.js");
const deletionLogs = vi.spyOn(logger, "info").mockImplementation(() => {});
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { Incident } = await import("../../../core/v1/incidents/incidents.model.js");
const { default: Attendance } = await import("../../../core/v1/attendance/attendance.model.js");
const { default: AccessLogs } = await import("../../../core/v1/accesslogs/accesslogs.model.js");
const { default: OptimizedAccessLogs } = await import("../../../core/v1/accesslogs/newAccessLogs.model.js");
const { default: GroupedAccessLogs } = await import("../../../core/v1/accesslogs/reworkedAccesslogs.model.js");
const { deleteMedia } = await import("../../../utils/mediaStorage.js");

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => { await clearCollections(); vi.clearAllMocks(); });

const historyModels = [Incident, Attendance, AccessLogs, OptimizedAccessLogs, GroupedAccessLogs];
const readHistory = () => Promise.all(historyModels.map(model => model.collection.find({}).sort({ _id: 1 }).toArray()));

describe("device removal retains historical data", () => {
  it.each(["dashboard NVR", "installer NVR", "dashboard RTSP camera"])("retains incidents, attendance, all access-log formats and media after removing a %s", async source => {
    const id = () => new mongoose.Types.ObjectId();
    const nvrId = id(), otherNvrId = id(), channelId = id(), inactiveChannelId = id(), otherChannelId = id();
    const adminId = id(), employeeId = id(), timestamp = new Date("2026-11-16T06:00:00Z");
    await Admin.collection.insertOne({ _id: adminId, user_id: "9001", name_f: "Harish", name_l: "Gowda", login: "harish", email: "harish@example.test" });
    await NVR.collection.insertMany([
      { _id: nvrId, userId: "9001", nvrName: "Removed device", location: "HQ",
        ...(source === "installer NVR" ? { localNvrId: "installer-1", managementSource: "installer" } : {}) },
      { _id: otherNvrId, userId: "9001", nvrName: "Other device", location: "Other" },
    ]);
    await Channel.collection.insertMany([
      { _id: channelId, userId: "9001", nvrId, name: "RTSP camera", isAdded: true },
      { _id: inactiveChannelId, userId: "9001", nvrId, name: "Inactive camera", isAdded: false },
      { _id: otherChannelId, userId: "9001", nvrId: otherNvrId, name: "Other camera", isAdded: true },
    ]);
    await Incident.collection.insertMany([channelId, inactiveChannelId, otherChannelId].map(camera => ({
      _id: id(), userId: "9001", nvrId: camera.equals(otherChannelId) ? otherNvrId : nvrId,
      channelId: camera, incidentName: "Recorded incident", timeOfIncident: timestamp,
      Image: `/uploads/images/${camera}.jpg`, videoLink: `/uploads/videos/${camera}.mp4`,
      currentImage: `/uploads/images/${camera}-current.jpg`, timeSeries: [{ Image: `/uploads/images/${camera}-timeline.jpg` }],
    })));
    // A daily record can mix removed and retained devices. Keep every event.
    const sessions = [channelId, otherChannelId].map(camera => ({
      nvr: camera.equals(otherChannelId) ? otherNvrId : nvrId, channel: camera,
      personName: "Employee", timestamp, images: { faceImage: `/uploads/images/${camera}-face.jpg` },
    }));
    await Attendance.collection.insertOne({ _id: id(), user: adminId, employee: employeeId, createdAt: timestamp,
      events: sessions.map(session => ({ nvr: session.nvr, channel: session.channel, cameraType: "checkin",
        timestamp, images: { face: session.images.faceImage } })) });
    for (const model of [AccessLogs, OptimizedAccessLogs]) {
      await model.collection.insertOne({ _id: id(), admin: adminId, userId: employeeId, date: timestamp, sessions });
    }
    await GroupedAccessLogs.collection.insertOne({ _id: id(), admin: adminId, date: timestamp,
      usersLogs: [{ userId: employeeId, sessions }] });
    const before = await readHistory();

    if (source === "dashboard RTSP camera") await DeleteService.deleteChannel(channelId);
    else await DeleteService.deleteNVR(nvrId, { appEnv: "cloud" });

    const messages = deletionLogs.mock.calls.map(([message]) => message);
    expect(messages).toContain(`[DEVICE-DELETE] Camera "RTSP camera" (id: ${channelId}) deleted from account "Harish Gowda" (userId: 9001). Historical logs and incidents retained.`);
    if (source !== "dashboard RTSP camera") expect(messages).toContain(`[DEVICE-DELETE] NVR "Removed device" (id: ${nvrId}) deleted from account "Harish Gowda" (userId: 9001). Historical logs and incidents retained.`);
    expect(await readHistory()).toEqual(before);
    expect(deleteMedia).not.toHaveBeenCalled();
    expect(await Channel.collection.findOne({ _id: channelId })).toBeNull();
    expect(await Channel.collection.findOne({ _id: otherChannelId })).not.toBeNull();
    expect(Boolean(await NVR.collection.findOne({ _id: nvrId }))).toBe(source === "dashboard RTSP camera");
    if (source !== "dashboard RTSP camera") expect(await Channel.collection.findOne({ _id: inactiveChannelId })).toBeNull();
  });
});
