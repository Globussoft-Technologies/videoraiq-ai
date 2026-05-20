/**
 * Integration test for AttendanceService.logAttendance — validation and the
 * admin/employee/channel lookup cascade, against in-memory MongoDB.
 * Socket is mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { sendPayloadToUser } = await import("../../../socket.js");

const { default: AttendanceService } = await import(
  "../../../core/v1/attendance/attendance.service.js"
);
const { default: Attendance } = await import(
  "../../../core/v1/attendance/attendance.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  sendPayloadToUser.mockClear();
});

/** Seed an admin + employee + channel; returns the ids for a valid body. */
async function seed() {
  const admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
  const employee = await AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Emp",
    lastName: "One",
    email: "emp@test.com",
  });
  const channel = await Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam",
  });
  return { admin, employee, channel };
}

function body({ admin, employee, channel }, over = {}) {
  return {
    cameraType: "checkin",
    employeeId: employee._id.toString(),
    userId: admin._id.toString(),
    nvrId: new mongoose.Types.ObjectId().toString(),
    channelId: channel._id.toString(),
    images: { face: "http://cdn/face.jpg" },
    ...over,
  };
}

describe("AttendanceService.logAttendance", () => {
  it("returns 400 for an invalid body", async () => {
    const { req, res } = serviceCtx({ body: {} });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body.success).toBe(false);
  });

  it("returns 404 when the admin does not exist", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({
      body: body(seeded, { userId: new mongoose.Types.ObjectId().toString() }),
    });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the employee does not exist", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({
      body: body(seeded, {
        employeeId: new mongoose.Types.ObjectId().toString(),
      }),
    });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the channel does not exist", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({
      body: body(seeded, {
        channelId: new mongoose.Types.ObjectId().toString(),
      }),
    });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("rejects a checkout before any check-in (400)", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({
      body: body(seeded, { cameraType: "checkout" }),
    });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("logs a valid check-in", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({ body: body(seeded) });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toBe("Attendance logged");
    const att = await Attendance.findOne({ employee: seeded.employee._id });
    expect(att).not.toBeNull();
    expect(att.events.some((e) => e.cameraType === "checkin")).toBe(true);
  });

  it("emits a sendPayloadToUser socket event with the right shape on check-in", async () => {
    const seeded = await seed();
    const { req, res } = serviceCtx({ body: body(seeded) });
    await AttendanceService.logAttendance(req, res);
    expect(res.statusCode).toBe(201);

    expect(sendPayloadToUser).toHaveBeenCalledTimes(1);
    const [userIdArg, channelArg, payloadArg] = sendPayloadToUser.mock.calls[0];
    // Admin.user_id is a string when seeded; the topic must scope to admin._id.
    expect(userIdArg).toBe(seeded.admin.user_id);
    expect(channelArg).toBe(`attendanceLog_${seeded.admin._id}`);

    expect(payloadArg.message).toBe("New attendance event logged");
    expect(payloadArg.attendance.channelId.toString()).toBe(
      seeded.channel._id.toString()
    );
    expect(payloadArg.attendance.channelName).toBe(seeded.channel.name);
    expect(payloadArg.attendance.event.cameraType).toBe("checkin");
    // Employee was populated before being sent over the socket.
    expect(payloadArg.attendance.employee._id.toString()).toBe(
      seeded.employee._id.toString()
    );
    expect(payloadArg.attendance.event.timestamp).toBeInstanceOf(Date);
  });

  it("allows a checkout after a check-in exists", async () => {
    const seeded = await seed();
    // first check in
    const inCtx = serviceCtx({ body: body(seeded) });
    await AttendanceService.logAttendance(inCtx.req, inCtx.res);
    // then check out
    const outCtx = serviceCtx({
      body: body(seeded, { cameraType: "checkout" }),
    });
    await AttendanceService.logAttendance(outCtx.req, outCtx.res);
    expect([200, 201]).toContain(outCtx.res.statusCode);
  });
});
