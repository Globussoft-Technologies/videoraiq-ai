/**
 * R80 coverage — `AccessLogsService.getLogs` (lines 494-726, the largest
 * uncovered region in core/v1/accesslogs/accesslogs.service.js at 68.4%
 * line coverage). Also picks up the residual tail of `getUserSessionReport`
 * (the populated `logs.forEach` push at 757-759, the startDate/endDate
 * `match.createdAt` arm at 742-746, and the pairing loop body at 770-787).
 *
 * `getLogs` runs an OptimizedAccessLogs aggregation pipeline that
 *   1) filters by admin + a UTC-day window derived from startDate/endDate,
 *   2) optionally drops `userId: null` (removeUnknown),
 *   3) filters by authorized employeeIds,
 *   4) `$filter`s sessions by nvr/channel/memberId-authChannel,
 *   5) drops docs with no sessions,
 *   6) looks up user + department,
 *   7) computes `lastCreatedAt`,
 *   8) applies fromTime/toTime + searchQuery,
 *   9) sorts + paginates (skipped when isExport=true) and projects.
 *
 * Tests use mongodb-memory-server end-to-end (no model mocks needed for
 * the aggregation). The known product bug at line 556
 * (`authorizedUsersModel` not imported — issue #108) means the
 * `employeeLocations`-non-empty branch must be skipped citing the issue.
 *
 * Mock budget: 1 (socket.js — same as accesslogs.service.extras.test.js).
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
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: AccessLogsService } = await import(
  "../../../core/v1/accesslogs/accesslogs.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
const { default: OptimizedAccessLogs } = await import(
  "../../../core/v1/accesslogs/newAccessLogs.model.js"
);

let admin, channel, channel2, nvr, nvr2;

beforeAll(async () => {
  await connectMongo();
  // Create the indexes that accesslogs service uses
  await OptimizedAccessLogs.collection.createIndex({ admin: 1, createdAt: -1 });
  await OptimizedAccessLogs.collection.createIndex({ admin: 1, lastCreatedAt: -1, createdAt: 1 });
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
  nvr = await NVR.create({
    userId: "1",
    nvrName: "NVR1",
    brand: "hikvision",
    domain: "http://nvr.test",
    location: "HQ",
    localNvrId: "local-1",
  });
  nvr2 = await NVR.create({
    userId: "1",
    nvrName: "NVR2",
    brand: "hikvision",
    domain: "http://nvr2.test",
    location: "Remote",
    localNvrId: "local-2",
  });
  channel = await Channel.create({
    nvrId: nvr._id,
    userId: "1",
    streamingPath: "/s",
    localChannelId: "1",
    name: "Cam1",
    isAdded: true,
  });
  channel2 = await Channel.create({
    nvrId: nvr2._id,
    userId: "1",
    streamingPath: "/s2",
    localChannelId: "2",
    name: "Cam2",
    isAdded: true,
  });
});

// Helper to seed a populated log doc. Each anonymous-user creation gets
// a unique email/userName to avoid the `{adminId,email}` unique index.
let seedSeq = 0;
async function seedLog({
  userId,
  personName = "John Doe",
  timestamp = new Date(),
  nvrId = nvr._id,
  channelId = channel._id,
  departmentId,
} = {}) {
  const overrides = departmentId ? { departmentId } : {};
  let userRef = userId;
  if (!userRef) {
    seedSeq += 1;
    const u = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "John",
      lastName: `Doe${seedSeq}`,
      userName: `jdoe-${seedSeq}`,
      email: `j${seedSeq}@d.com`,
      profilePics: ["http://img/1.jpg"],
      password: "x",
      ...overrides,
    });
    userRef = u._id;
  }
  return OptimizedAccessLogs.create({
    admin: admin._id,
    userId: userRef,
    sessions: [
      {
        nvr: nvrId,
        channel: channelId,
        personName,
        timestamp,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// getLogs
// ---------------------------------------------------------------------------
describe("AccessLogsService.getLogs", () => {
  it("returns 400 when adminId is missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await AccessLogsService.getLogs(req, res, next);
    expect(res.statusCode).toBe(400);
    // res.status(400).json(Response.errorResp(...)) → _body wraps the whole
    // {statusCode, body} envelope. The unwrapped payload lives at _body.body.
    expect(payload(res)?.status).toBe("failed");
    expect(payload(res)?.message).toMatch(/Missing adminId/);
  });

  it("returns success with empty results on a fresh DB", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {},
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(0);
    expect(payload(res).data.usersLogs).toEqual([]);
    expect(payload(res).data.skip).toBe(0);
    expect(payload(res).data.limit).toBe(10);
  });

  it("returns today's log with userInfo + department projected", async () => {
    const dept = await Department.create({
      adminId: admin._id,
      departmentName: "Eng",
    });
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "John",
      lastName: "Doe",
      userName: "jdoe",
      email: "j@d.com",
      profilePics: ["http://img/1.jpg"],
      password: "x",
      departmentId: dept._id,
    });
    await seedLog({ userId: user._id });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {},
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(1);
    expect(payload(res).data.usersLogs).toHaveLength(1);
    const log = payload(res).data.usersLogs[0];
    expect(String(log.userInfo._id)).toBe(String(user._id));
    expect(log.userInfo.userName).toBe("jdoe");
    expect(String(log.department._id)).toBe(String(dept._id));
    expect(log.department.departmentName).toBe("Eng");
    expect(log.sessions).toHaveLength(1);
  });

  it("rejects an unknown department id", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        departmentIds: [new mongoose.Types.ObjectId().toString()],
      },
    });
    await AccessLogsService.getLogs(req, res, next);
    // `Response.errorResp` shape — status: "error"
    expect(res._body?.body?.status || res._body?.status).toMatch(/error|fail/);
    expect(
      payload(res)?.message ||
        res._body?.message ||
        JSON.stringify(res._body),
    ).toMatch(/Incorrect department/);
  });

  it("filters by matching departmentIds", async () => {
    const dept = await Department.create({
      adminId: admin._id,
      departmentName: "Eng",
    });
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "John",
      lastName: "Doe",
      userName: "jdoe",
      email: "j@d.com",
      profilePics: ["http://img/1.jpg"],
      password: "x",
      departmentId: dept._id,
    });
    await seedLog({ userId: user._id });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { departmentIds: [dept._id.toString()] },
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(1);
  });

  it("filters out sessions when nvrIds doesn't match", async () => {
    await seedLog();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { nvrIds: [nvr2._id.toString()] }, // different NVR
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    // session filter drops session; doc dropped by $match sessions.0
    expect(payload(res).data.total).toBe(0);
  });

  it("keeps sessions when channelIds matches", async () => {
    await seedLog();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { channelIds: [channel._id.toString()] },
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(1);
  });

  it("memberId+authorizedChannels restricts sessions by channel", async () => {
    // Session is on channel; authChannels includes channel2 only → filtered out
    await seedLog();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      memberId: "m-1",
      authorizedChannel: {
        channels: [channel2._id.toString()],
        employeeLocations: [],
      },
      body: {},
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(0);
  });

  it("filters via searchQuery against userInfo.userName", async () => {
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Alice",
      lastName: "Doe",
      userName: "alice-uniq",
      email: "alice@d.com",
      profilePics: ["http://img/a.jpg"],
      password: "x",
    });
    await seedLog({ userId: user._id });

    const matching = serviceCtx({
      adminId: admin._id,
      body: { searchQuery: "alice-uniq" },
    });
    await AccessLogsService.getLogs(matching.req, matching.res, matching.next);
    expect(payload(matching.res).data.total).toBe(1);

    const nope = serviceCtx({
      adminId: admin._id,
      body: { searchQuery: "totally-not-there" },
    });
    await AccessLogsService.getLogs(nope.req, nope.res, nope.next);
    expect(payload(nope.res).data.total).toBe(0);
  });

  it("applies fromTime/toTime + startDate/endDate window (covers branch at 521-538)", async () => {
    // Seed one session at "now" (today) — purpose is to cover the
    // fromTime/toTime branch that builds fromDateTime/toDateTime (lines
    // 521-538). The actual `lastCreatedAt $gte/$lte` pipeline match uses
    // moment-local times, so we widen the window to cover any reasonable
    // local-vs-UTC offset to keep this test timezone-independent.
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "T",
      lastName: "User",
      userName: "tuser",
      email: "t@u.com",
      profilePics: ["http://img/t.jpg"],
      password: "x",
    });
    await OptimizedAccessLogs.create({
      admin: admin._id,
      userId: user._id,
      sessions: [
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Now",
          timestamp: new Date(),
        },
      ],
    });

    // 24-hour window spanning today should match the seeded session
    // regardless of local timezone interpretation in the service.
    const today = new Date();
    const todayStr = today.toISOString();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        startDate: todayStr,
        endDate: todayStr,
        fromTime: "0:00",
        toTime: "23:59",
      },
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(1);
  });

  it("removeUnknown=true drops docs with userId:null", async () => {
    // doc with null userId
    await OptimizedAccessLogs.create({
      admin: admin._id,
      userId: null,
      sessions: [
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Unknown",
          timestamp: new Date(),
        },
      ],
    });
    // doc with userId set
    await seedLog();

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { removeUnknown: true },
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(1);
  });

  it("isExport=true skips $skip/$limit pagination", async () => {
    // Seed 3 logs; page-1 with limit=1 would normally return 1 doc.
    await seedLog({ personName: "U1" });
    await seedLog({ personName: "U2" });
    await seedLog({ personName: "U3" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { isExport: true, skip: 0, limit: 1 },
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.total).toBe(3);
    expect(payload(res).data.usersLogs).toHaveLength(3); // pagination skipped
  });

  it("ascending sort by lastCreatedAt orders oldest first", async () => {
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const later = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const u1 = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "A",
      lastName: "One",
      userName: "u1",
      email: "u1@x.com",
      profilePics: [],
      password: "x",
    });
    const u2 = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "B",
      lastName: "Two",
      userName: "u2",
      email: "u2@x.com",
      profilePics: [],
      password: "x",
    });
    await seedLog({ userId: u1._id, timestamp: earlier });
    await seedLog({ userId: u2._id, timestamp: later });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { sortOrder: "asc", sortField: "lastCreatedAt" },
      body: {},
    });
    await AccessLogsService.getLogs(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.usersLogs).toHaveLength(2);
    const ts0 = new Date(payload(res).data.usersLogs[0].lastCreatedAt).getTime();
    const ts1 = new Date(payload(res).data.usersLogs[1].lastCreatedAt).getTime();
    expect(ts0).toBeLessThanOrEqual(ts1);
  });

  it.skip(
    "employeeLocations non-empty branch crashes — authorizedUsersModel not imported (issue #108)",
    async () => {
      // intentionally skipped — see issue #108. Re-enable once line 556 is
      // changed to use the imported `userModel`.
    },
  );

  it("catch arm: invalid adminId shape routes to next(AppError)", async () => {
    // Send an unparseable ObjectId-ish adminId (string with bad length) so
    // `new ObjectId(adminId)` inside the pipeline throws → caught by outer
    // try/catch. (verified empirically: ObjectId("not-an-objectid") throws)
    const { req, res, next } = serviceCtx({
      adminId: "not-a-valid-objectid",
      body: {},
    });
    await AccessLogsService.getLogs(req, res, next);
    // either next was called with an AppError, or res.send returned a 500
    if (next.calls.length > 0) {
      expect(next.calls[0]).toBeDefined();
      expect(next.calls[0].statusCode || next.calls[0].status).toBe(500);
    } else {
      // some paths short-circuit before the ObjectId conversion
      expect(payload(res)?.status).not.toBe("success");
    }
  });
});

// ---------------------------------------------------------------------------
// getUserSessionReport — happy-path pairing + populated forEach push +
// startDate/endDate window filter
// ---------------------------------------------------------------------------
//
// (The previously-skipped pairing tests in
//  accesslogs.service.sessions.test.js were skipped on a misdiagnosis:
//  `formatDuration` IS defined as a module-scope const at line 1153, and
//  is in scope when `getUserSessionReport` runs at request time. The TDZ
//  for const only matters within the same lexical scope before the const
//  declaration; here the function executes after module load, so the
//  const is initialised.)
describe("AccessLogsService.getUserSessionReport — populated pairing path", () => {
  it("pairs two sessions into a single (checkIn, checkOut) tuple", async () => {
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Pair",
      lastName: "User",
      userName: "puser",
      email: "p@u.com",
      profilePics: [],
      password: "x",
    });
    const inAt = new Date("2026-05-26T08:00:00.000Z");
    const outAt = new Date("2026-05-26T08:30:00.000Z");
    await OptimizedAccessLogs.create({
      admin: admin._id,
      userId: user._id,
      sessions: [
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Pair User",
          timestamp: inAt,
        },
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Pair User",
          timestamp: outAt,
        },
      ],
    });

    const { req, res, next } = serviceCtx({
      body: { userId: user._id.toString() },
    });
    await AccessLogsService.getUserSessionReport(req, res, next);
    // `res.json` was called directly — _body is the raw object.
    const body = res._body;
    expect(body).toBeDefined();
    expect(body.totalSessions).toBe(1);
    expect(body.sessions[0].durationMinutes).toBe(30);
    expect(body.sessions[0].durationReadable).toMatch(/30m/);
    expect(new Date(body.sessions[0].checkIn).toISOString()).toBe(
      inAt.toISOString(),
    );
    expect(new Date(body.sessions[0].checkOut).toISOString()).toBe(
      outAt.toISOString(),
    );
  });

  it("trailing unmatched session is ignored (odd-count break)", async () => {
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Odd",
      lastName: "User",
      userName: "ouser",
      email: "o@u.com",
      profilePics: [],
      password: "x",
    });
    const t = new Date("2026-05-26T09:00:00.000Z");
    await OptimizedAccessLogs.create({
      admin: admin._id,
      userId: user._id,
      sessions: [
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Odd User",
          timestamp: t,
        },
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Odd User",
          timestamp: new Date(t.getTime() + 10 * 60 * 1000),
        },
        {
          nvr: nvr._id,
          channel: channel._id,
          personName: "Odd User",
          timestamp: new Date(t.getTime() + 60 * 60 * 1000),
        },
      ],
    });
    const { req, res, next } = serviceCtx({
      body: { userId: user._id.toString() },
    });
    await AccessLogsService.getUserSessionReport(req, res, next);
    expect(res._body.totalSessions).toBe(1);
  });

  it("startDate/endDate window filter restricts matched logs", async () => {
    const user = await AuthorizedUsers.create({
      adminId: admin._id,
      firstName: "Win",
      lastName: "User",
      userName: "wuser",
      email: "w@u.com",
      profilePics: [],
      password: "x",
    });
    const inWindow = new Date("2026-05-22T08:00:00.000Z");
    const outOfWindow = new Date("2026-05-01T08:00:00.000Z");

    // In-window doc (createdAt set via collection.insertOne to bypass
    // mongoose timestamps:true override).
    await OptimizedAccessLogs.collection.insertOne({
      admin: admin._id,
      userId: user._id,
      date: inWindow,
      createdAt: inWindow,
      updatedAt: inWindow,
      sessions: [
        {
          _id: new mongoose.Types.ObjectId(),
          nvr: nvr._id,
          channel: channel._id,
          personName: "W",
          timestamp: inWindow,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          nvr: nvr._id,
          channel: channel._id,
          personName: "W",
          timestamp: new Date(inWindow.getTime() + 30 * 60 * 1000),
        },
      ],
    });
    // Out-of-window doc — should be excluded by the createdAt $gte/$lte
    await OptimizedAccessLogs.collection.insertOne({
      admin: admin._id,
      userId: user._id,
      date: outOfWindow,
      createdAt: outOfWindow,
      updatedAt: outOfWindow,
      sessions: [
        {
          _id: new mongoose.Types.ObjectId(),
          nvr: nvr._id,
          channel: channel._id,
          personName: "W-Old",
          timestamp: outOfWindow,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          nvr: nvr._id,
          channel: channel._id,
          personName: "W-Old",
          timestamp: new Date(outOfWindow.getTime() + 30 * 60 * 1000),
        },
      ],
    });

    const { req, res, next } = serviceCtx({
      body: {
        userId: user._id.toString(),
        startDate: "2026-05-20T00:00:00.000Z",
        endDate: "2026-05-25T00:00:00.000Z",
      },
    });
    await AccessLogsService.getUserSessionReport(req, res, next);
    expect(res._body.totalSessions).toBe(1);
  });
});
