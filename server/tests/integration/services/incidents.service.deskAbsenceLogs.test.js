/**
 * IncidentsService.getDeskAbsenceLogs — graph endpoint.
 *
 * Desk-absence detections are each stored as their own document, so this
 * endpoint must collect every document's time-series points and merge them
 * per camera (channelId) into a single sorted series. These tests seed
 * DeskAbsenceIncident documents and assert the merge plus every filter
 * (user scoping, date window, nvrId/nvrIds, channelId/authorizedChannels,
 * per-point zoneName) and camera-level pagination.
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
const { DeskAbsenceIncident } = incidentsModel;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

// One detection => one document, each carrying a single time-series point.
const seedDetection = ({
  userId = "100",
  nvrId = new mongoose.Types.ObjectId(),
  channelId = new mongoose.Types.ObjectId(),
  timestamp = new Date(),
  personCount = 0,
  zoneName = "Desk A",
  personPresent = false,
} = {}) =>
  DeskAbsenceIncident.create({
    timeOfIncident: timestamp,
    nvrId,
    channelId,
    userId,
    personPresent,
    timeSeries: [{ timestamp, personCount, zoneName, personPresent }],
  });

describe("IncidentsService.getDeskAbsenceLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("merges every document of a camera into one sorted time-series", async () => {
    const channelId = new mongoose.Types.ObjectId();
    const nvrId = new mongoose.Types.ObjectId();
    // Seed three separate detections (three docs) for the SAME camera,
    // intentionally out of chronological order.
    await seedDetection({ channelId, nvrId, timestamp: new Date("2026-06-25T10:17:00Z"), personCount: 2 });
    await seedDetection({ channelId, nvrId, timestamp: new Date("2026-06-25T10:15:00Z"), personCount: 0 });
    await seedDetection({ channelId, nvrId, timestamp: new Date("2026-06-25T10:16:00Z"), personCount: 1 });

    const { req, res, next } = serviceCtx({ user_id: "100", query: {} });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);

    expect(res.statusCode).toBe(200);
    // One camera => one record, even though three documents were stored.
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data).toHaveLength(1);

    const series = res._body.body.data.data[0].timeSeries;
    expect(series).toHaveLength(3);
    // Sorted ascending by timestamp.
    expect(series.map((p) => p.personCount)).toEqual([0, 1, 2]);
    expect(series[0]).toMatchObject({ personCount: 0, zoneName: "Desk A" });
  });

  it("keeps separate cameras as separate series", async () => {
    const chA = new mongoose.Types.ObjectId();
    const chB = new mongoose.Types.ObjectId();
    await seedDetection({ channelId: chA });
    await seedDetection({ channelId: chA });
    await seedDetection({ channelId: chB });

    const { req, res, next } = serviceCtx({ user_id: "100", query: {} });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(2);
  });

  it("scopes results to the authenticated user_id", async () => {
    await seedDetection({ userId: "100" });
    await seedDetection({ userId: "200" });
    const { req, res, next } = serviceCtx({ user_id: "100", query: {} });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
  });

  it("filters by startDate / endDate window", async () => {
    const inRange = new mongoose.Types.ObjectId();
    const outRange = new mongoose.Types.ObjectId();
    await seedDetection({ channelId: inRange, timestamp: new Date("2026-06-15T12:00:00Z") });
    await seedDetection({ channelId: outRange, timestamp: new Date("2020-01-01T12:00:00Z") });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { startDate: "2026-06-01", endDate: "2026-06-30" },
    });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0]._id.toString()).toBe(inRange.toString());
  });

  it("filters by a single nvrId and a comma-separated nvrIds list", async () => {
    const nvr1 = new mongoose.Types.ObjectId();
    const nvr2 = new mongoose.Types.ObjectId();
    const nvr3 = new mongoose.Types.ObjectId();
    await seedDetection({ nvrId: nvr1, channelId: new mongoose.Types.ObjectId() });
    await seedDetection({ nvrId: nvr2, channelId: new mongoose.Types.ObjectId() });
    await seedDetection({ nvrId: nvr3, channelId: new mongoose.Types.ObjectId() });

    {
      const { req, res, next } = serviceCtx({ user_id: "100", body: { nvrId: nvr1.toString() } });
      await IncidentsService.getDeskAbsenceLogs(req, res, next);
      expect(res._body.body.data.totalCount).toBe(1);
    }
    {
      const { req, res, next } = serviceCtx({
        user_id: "100",
        body: { nvrIds: `${nvr1.toString()},${nvr2.toString()}` },
      });
      await IncidentsService.getDeskAbsenceLogs(req, res, next);
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
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0]._id.toString()).toBe(ch1.toString());
  });

  it("intersects channelId param with authorizedChannels (empty intersection => 0)", async () => {
    const ch1 = new mongoose.Types.ObjectId();
    const ch2 = new mongoose.Types.ObjectId();
    await seedDetection({ channelId: ch1 });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      authorizedChannel: { channels: [ch1] },
      body: { channelIds: ch2.toString() },
    });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(0);
  });

  it("filters time-series points by zoneName, dropping cameras with no match", async () => {
    const chMixed = new mongoose.Types.ObjectId();
    const chOther = new mongoose.Types.ObjectId();
    // chMixed has points in two zones.
    await seedDetection({ channelId: chMixed, zoneName: "Reception", personCount: 1 });
    await seedDetection({ channelId: chMixed, zoneName: "Pantry", personCount: 2 });
    // chOther only has Pantry.
    await seedDetection({ channelId: chOther, zoneName: "Pantry", personCount: 3 });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { zoneNames: ["Reception"] },
    });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    // Only chMixed survives, and only its Reception point remains.
    expect(res._body.body.data.totalCount).toBe(1);
    const record = res._body.body.data.data[0];
    expect(record._id.toString()).toBe(chMixed.toString());
    expect(record.timeSeries).toHaveLength(1);
    expect(record.timeSeries[0].zoneName).toBe("Reception");
  });

  it("paginates by camera via skip/limit", async () => {
    for (let i = 0; i < 5; i++) {
      await seedDetection({ channelId: new mongoose.Types.ObjectId() });
    }
    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { skip: "1", limit: "2" },
    });
    await IncidentsService.getDeskAbsenceLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(5);
    expect(res._body.body.data.data).toHaveLength(2);
  });
});
