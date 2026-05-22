/**
 * Real vertical Supertest contract for `/api/v1/attendance` — hits the real
 * router + controller + service with in-memory MongoDB. Targets the
 * attendance.controller.js (0% covered otherwise).
 *
 * The routes file does NOT attach verifyToken, but the service code reads
 * `req.verified.userData.adminId`, so a tiny fixture middleware injects it
 * before the real router runs.
 *
 * Mocks:
 *   1. middlewares/permissionMiddleware.js — wave the view-access verb through
 *   2. socket.js (sendPayloadToUser)       — no socket gateway in tests
 *
 * 2 mocks total. Controller + service + Mongo stay real.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

vi.mock("../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
  emitToRoom: vi.fn(),
  default: {},
}));

const { buildApp } = await import("../helpers/app.js");
const { default: attendanceRoutes } = await import(
  "../../core/v1/attendance/attendance.routes.js"
);
const { default: Attendance } = await import(
  "../../core/v1/attendance/attendance.model.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: AuthorizedUsers } = await import(
  "../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Channel } = await import(
  "../../core/v1/channels/channels.model.js"
);
await import("../../core/v1/NVR/nvr.model.js");

let app;
let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "att-real-1",
    login: "att-real",
    email: "att-real@test.com",
  });
  app = buildApp((a) => {
    a.use("/api/v1/attendance", (req, _res, next) => {
      req.verified = {
        state: true,
        userData: {
          adminId: admin._id,
          user_id: "att-real-1",
          memberId: undefined,
        },
        authorizedChannel: null,
      };
      next();
    });
    a.use("/api/v1/attendance", attendanceRoutes);
  });
});

/** Plain JSON envelope (service uses res.status(N).json(Response.xxx(...))). */
const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// POST /  →  logAttendance
// ----------------------------------------------------------------------------
describe("POST /api/v1/attendance/ (real vertical, logAttendance)", () => {
  async function seed() {
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
      name: "Cam-A",
    });
    return { employee, channel };
  }

  function validBody({ employee, channel }, over = {}) {
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

  it("returns 400 when the body fails Joi validation", async () => {
    const res = await request(app).post("/api/v1/attendance/").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 404 when the admin (userId) does not exist", async () => {
    const { employee, channel } = await seed();
    const ghost = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post("/api/v1/attendance/")
      .send(validBody({ employee, channel }, { userId: ghost.toString() }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when employee is not found", async () => {
    const { channel } = await seed();
    const ghostEmp = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post("/api/v1/attendance/")
      .send({
        cameraType: "checkin",
        employeeId: ghostEmp.toString(),
        userId: admin._id.toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: channel._id.toString(),
        images: { face: "http://cdn/face.jpg" },
      });
    expect(res.status).toBe(404);
  });

  it("returns 400 when checkout is attempted before any checkin exists", async () => {
    const { employee, channel } = await seed();
    const res = await request(app)
      .post("/api/v1/attendance/")
      .send(validBody({ employee, channel }, { cameraType: "checkout" }));
    expect(res.status).toBe(400);
  });

  it("creates an attendance event on checkin", async () => {
    const { employee, channel } = await seed();
    const res = await request(app)
      .post("/api/v1/attendance/")
      .send(validBody({ employee, channel }));
    expect(res.status).toBe(201);
    const docs = await Attendance.find({ employee: employee._id });
    expect(docs).toHaveLength(1);
    expect(docs[0].events).toHaveLength(1);
    expect(docs[0].events[0].cameraType).toBe("checkin");
  });
});

// ----------------------------------------------------------------------------
// POST /user-logs  →  getUserLogs
// ----------------------------------------------------------------------------
describe("POST /api/v1/attendance/user-logs (real vertical)", () => {
  it("400s when employeeId or date is missing", async () => {
    const res = await request(app)
      .post("/api/v1/attendance/user-logs")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns an empty array when no attendance exists for the date", async () => {
    const employee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Emp",
      lastName: "One",
      email: "emp@test.com",
    });
    const res = await request(app)
      .post("/api/v1/attendance/user-logs")
      .send({ employeeId: employee._id.toString(), date: new Date() });
    expect(res.status).toBe(200);
    expect(inner(res).message).toMatch(/no logs/i);
  });

  it("pairs sequential checkout → checkin events into log rows", async () => {
    const employee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Emp",
      lastName: "Two",
      email: "emp2@test.com",
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "u1",
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "Cam-B",
    });
    const base = new Date();
    await Attendance.create({
      user: admin._id,
      employee: employee._id,
      events: [
        {
          cameraType: "checkin",
          timestamp: new Date(base.getTime() - 60000 * 30),
          channel: channel._id,
          images: { face: "f1" },
        },
        {
          cameraType: "checkout",
          timestamp: new Date(base.getTime() - 60000 * 20),
          channel: channel._id,
          images: { face: "f2" },
        },
        {
          cameraType: "checkin",
          timestamp: new Date(base.getTime() - 60000 * 10),
          channel: channel._id,
          images: { face: "f3" },
        },
      ],
    });
    const res = await request(app)
      .post("/api/v1/attendance/user-logs")
      .send({ employeeId: employee._id.toString(), date: base });
    expect(res.status).toBe(200);
    expect(inner(res).data.logs).toHaveLength(1);
    expect(inner(res).data.logs[0].checkout.cameraType).toBe("checkout");
    expect(inner(res).data.logs[0].checkin.cameraType).toBe("checkin");
  });
});

// ----------------------------------------------------------------------------
// POST /get  →  getAttendance (aggregation)
// ----------------------------------------------------------------------------
describe("POST /api/v1/attendance/get (real vertical)", () => {
  it("returns an empty attendance summary when no data exists", async () => {
    const res = await request(app).post("/api/v1/attendance/get").send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.total).toBe(0);
    expect(Array.isArray(body.data.attendanceLogs)).toBe(true);
  });

  it("aggregates checkin/checkout events for an employee", async () => {
    const employee = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Emp",
      lastName: "Three",
      email: "emp3@test.com",
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "u1",
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "Cam-C",
    });
    const base = new Date();
    await Attendance.create({
      user: admin._id,
      employee: employee._id,
      events: [
        {
          cameraType: "checkin",
          timestamp: new Date(base.getTime() - 60000 * 60),
          channel: channel._id,
          images: { face: "f1" },
        },
        {
          cameraType: "checkout",
          timestamp: new Date(base.getTime() - 60000 * 10),
          channel: channel._id,
          images: { face: "f2" },
        },
      ],
    });
    const res = await request(app).post("/api/v1/attendance/get").send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    expect(body.data.attendanceLogs[0].minutesSpent).toBeGreaterThan(0);
  });
});
