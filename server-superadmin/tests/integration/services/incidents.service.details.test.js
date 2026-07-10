/**
 * IncidentsService.getIncidentsDetails — the four mutually-exclusive filter
 * branches (criticalIncidents / resolvedIncidents / totalIncidents /
 * ActiveChannels) and the "no filter selected" fallthrough. The validation
 * branches are exercised by incidents.service.lists.test.js; this file fills
 * in the count/search/date branches that drive aggregation pipelines.
 *
 * Mocks: 4 (alerts, socket, SFTP connection check, jobs service) — matches
 * the existing incidents test suites.
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
const { Incident } = incidentsModel;
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

async function seedIncident(over = {}) {
  return Incident.create({
    timeOfIncident: new Date(),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: "100",
    incidentName: "Motion",
    incidentType: "motionDetection",
    Image: "https://cdn.example.com/img.png",
    severity: "moderate",
    resolved: false,
    description: "ok",
    ...over,
  });
}

let channelSeq = 0;
async function seedChannel(over = {}) {
  channelSeq += 1;
  return Channel.create({
    name: "C1",
    customName: "Custom",
    nvrId: new mongoose.Types.ObjectId(),
    userId: "100",
    streamingPath: `/stream/${channelSeq}`,
    localChannelId: `local-${channelSeq}`,
    isAdded: true,
    detections: {
      countPersonsSettings: { enabled: true },
    },
    ...over,
  });
}

// ----------------------------------------------------------------------------
// getIncidentsDetails — criticalIncidents branch
// ----------------------------------------------------------------------------
describe("IncidentsService.getIncidentsDetails — criticalIncidents", () => {
  it("returns only severity=high incidents with a valid Image", async () => {
    await seedIncident({ severity: "high" });
    await seedIncident({ severity: "low" });
    await seedIncident({ severity: "high", Image: "" }); // missing image
    await seedIncident({ severity: "high", Image: "https://" }); // sentinel

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { criticalIncidents: true },
      query: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("filters criticalIncidents by nvrId / channelId", async () => {
    const nvr = new mongoose.Types.ObjectId();
    const ch = new mongoose.Types.ObjectId();
    await seedIncident({ severity: "high", nvrId: nvr, channelId: ch });
    await seedIncident({ severity: "high" }); // different ids

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { criticalIncidents: true },
      query: { nvrId: nvr.toString(), channelId: ch.toString() },
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("applies a string search to criticalIncidents", async () => {
    await seedIncident({ severity: "high", incidentName: "PERSON-HIT" });
    await seedIncident({ severity: "high", incidentName: "ANOTHER" });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { criticalIncidents: true },
      query: { search: "person-hit" },
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// getIncidentsDetails — resolvedIncidents branch
// ----------------------------------------------------------------------------
describe("IncidentsService.getIncidentsDetails — resolvedIncidents", () => {
  it("returns only resolved=true incidents (excluding countPersons / lineCrossing)", async () => {
    await seedIncident({ resolved: true });
    await seedIncident({ resolved: false });
    await seedIncident({ resolved: true, incidentType: "countPersons" });
    await seedIncident({ resolved: true, incidentType: "lineCrossing" });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { resolvedIncidents: true },
      query: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("returns success with totalCount 0 when no resolved incidents match a numeric search", async () => {
    await seedIncident({ resolved: true });
    await seedIncident({ resolved: false });

    // Unit isn't on the base incident schema; the numeric branch of the search
    // still executes, the aggregation just yields zero hits.
    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { resolvedIncidents: true },
      query: { search: "42" },
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// getIncidentsDetails — totalIncidents branch
// ----------------------------------------------------------------------------
describe("IncidentsService.getIncidentsDetails — totalIncidents", () => {
  it("returns all qualifying incidents (excluding countPersons / lineCrossing)", async () => {
    await seedIncident();
    await seedIncident({ resolved: false });
    await seedIncident({ incidentType: "countPersons" });
    await seedIncident({ incidentType: "lineCrossing" });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { totalIncidents: true },
      query: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
  });

  it("totalIncidents respects a start/end date range", async () => {
    await seedIncident({ timeOfIncident: new Date("2024-06-15T12:00:00Z") });
    await seedIncident({ timeOfIncident: new Date("2024-01-01T12:00:00Z") });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: {
        totalIncidents: true,
        startDate: "2024-06-01",
        endDate: "2024-06-30",
      },
      query: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// getIncidentsDetails — ActiveChannels branch
// ----------------------------------------------------------------------------
describe("IncidentsService.getIncidentsDetails — ActiveChannels", () => {
  it("returns channels with at least one enabled detection setting", async () => {
    await seedChannel({
      detections: { countPersonsSettings: { enabled: true } },
    });
    await seedChannel({
      detections: { motionDetectionSettings: { enabled: true } },
    });
    await seedChannel({
      detections: { countPersonsSettings: { enabled: false } },
    });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { ActiveChannels: true },
      query: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.overAllCameraCount).toBe(3);
  });

  it("ActiveChannels honours a string search across configured fields", async () => {
    await seedChannel({
      name: "Cam-Search-Hit",
      detections: { countPersonsSettings: { enabled: true } },
    });
    await seedChannel({
      name: "Other",
      detections: { countPersonsSettings: { enabled: true } },
    });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: { ActiveChannels: true },
      query: { search: "search-hit" },
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// getIncidentsDetails — no filter selected
// ----------------------------------------------------------------------------
describe("IncidentsService.getIncidentsDetails — no filter", () => {
  it("returns a validation-failed envelope when no filter flag is set", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "100",
      body: {},
      query: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
