/**
 * IncidentsService.getGuardSleepingLogs — paginated list endpoint.
 *
 * Unlike deskAbsence (one document accumulating a timeSeries[] array),
 * guardSleeping detections are stored as one flat document per event, mirroring
 * guardAbsence. These tests seed GuardSleepingIncident documents and assert
 * every filter (user scoping, date window, nvrId/nvrIds, channelId/
 * authorizedChannels, isSleeping) plus pagination and newest-first ordering.
 *
 * Mocks: 4 (alerts, socket, SFTP connection check, jobs service) — same as the
 * rest of the incidents suite.
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

vi.mock("../../../core/v1/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);
const incidentsModel = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { GuardSleepingIncident } = incidentsModel;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

const seedDetection = ({
  userId = "100",
  nvrId = new mongoose.Types.ObjectId(),
  channelId = new mongoose.Types.ObjectId(),
  timestamp = new Date(),
  isSleeping = true,
} = {}) =>
  GuardSleepingIncident.create({
    timeOfIncident: timestamp,
    nvrId,
    channelId,
    userId,
    isSleeping,
  });

describe("IncidentsService.getGuardSleepingLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getGuardSleepingLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns one row per detection event, newest first", async () => {
    await seedDetection({ timestamp: new Date("2026-06-25T10:15:00Z") });
    await seedDetection({ timestamp: new Date("2026-06-25T10:17:00Z") });
    await seedDetection({ timestamp: new Date("2026-06-25T10:16:00Z") });

    const { req, res, next } = serviceCtx({ user_id: "100", query: {} });
    await IncidentsService.getGuardSleepingLogs(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(3);
    const times = res._body.body.data.data.map((d) => new Date(d.timeOfIncident).toISOString());
    expect(times).toEqual([...times].sort().reverse());
  });

  it("scopes results to the authenticated user_id", async () => {
    await seedDetection({ userId: "100" });
    await seedDetection({ userId: "200" });
    const { req, res, next } = serviceCtx({ user_id: "100", query: {} });
    await IncidentsService.getGuardSleepingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
  });

  it("filters by startDate / endDate window", async () => {
    await seedDetection({ timestamp: new Date("2026-06-15T12:00:00Z") });
    await seedDetection({ timestamp: new Date("2020-01-01T12:00:00Z") });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { startDate: "2026-06-01", endDate: "2026-06-30" },
    });
    await IncidentsService.getGuardSleepingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
  });

  it("filters by a single nvrId and a comma-separated nvrIds list", async () => {
    const nvr1 = new mongoose.Types.ObjectId();
    const nvr2 = new mongoose.Types.ObjectId();
    const nvr3 = new mongoose.Types.ObjectId();
    await seedDetection({ nvrId: nvr1 });
    await seedDetection({ nvrId: nvr2 });
    await seedDetection({ nvrId: nvr3 });

    {
      const { req, res, next } = serviceCtx({ user_id: "100", body: { nvrId: nvr1.toString() } });
      await IncidentsService.getGuardSleepingLogs(req, res, next);
      expect(res._body.body.data.totalCount).toBe(1);
    }
    {
      const { req, res, next } = serviceCtx({
        user_id: "100",
        body: { nvrIds: `${nvr1.toString()},${nvr2.toString()}` },
      });
      await IncidentsService.getGuardSleepingLogs(req, res, next);
      expect(res._body.body.data.totalCount).toBe(2);
    }
  });

  it("restricts results to authorizedChannels when set on the request", async () => {
    const ch1 = new mongoose.Types.ObjectId();
    const ch2 = new mongoose.Types.ObjectId();
    await seedDetection({ channelId: ch1 });
    await seedDetection({ channelId: ch2 });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      authorizedChannel: { channels: [ch1] },
      query: {},
    });
    await IncidentsService.getGuardSleepingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
  });

  it("filters by isSleeping, combined with other filters", async () => {
    const nvr1 = new mongoose.Types.ObjectId();
    await seedDetection({ nvrId: nvr1, isSleeping: true });
    await seedDetection({ nvrId: nvr1, isSleeping: false });
    await seedDetection({ isSleeping: true }); // different nvr, should be excluded below

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { nvrId: nvr1.toString(), isSleeping: true },
    });
    await IncidentsService.getGuardSleepingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].isSleeping).toBe(true);
  });

  it("paginates via skip/limit", async () => {
    for (let i = 0; i < 5; i++) {
      await seedDetection();
    }
    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { skip: "1", limit: "2" },
    });
    await IncidentsService.getGuardSleepingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(5);
    expect(res._body.body.data.data).toHaveLength(2);
  });
});
