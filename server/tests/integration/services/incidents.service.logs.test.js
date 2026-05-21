/**
 * IncidentsService — log fetcher endpoints that funnel through _fetchIncidentLogs:
 *   getVehicleDetectionLogs / getVehicleNumbers
 *   getConveyorDetectionLogs / getCrusherDetectionLogs
 *   getWaterSpillageDetectionLogs
 *   getVehicleCountLogs / getLineCrossingLogs
 *
 * Pattern: seed Incident documents via the appropriate discriminator and assert
 * the response envelope, filtering behaviour (date / search / extraMatch /
 * authorizedChannels), and pagination. No external services involved beyond
 * the same alert/socket/SFTP/jobs stubs the rest of the incidents suite uses.
 *
 * Mocks: 4 (alerts, socket, SFTP connection check, jobs service).
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
const {
  Incident,
  VehicleDetectionIncident,
  ConveyorDetectionIncident,
  CrusherDetectionIncident,
  WaterSpillageDetectionIncident,
  CountVehiclesIncident,
  LineCrossingAuthIncident,
} = incidentsModel;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

// ----------------------------------------------------------------------------
// getVehicleDetectionLogs
// ----------------------------------------------------------------------------

describe("IncidentsService.getVehicleDetectionLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns all vehicleDetection rows scoped to user_id", async () => {
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "MH-01-AB-1234",
      count: 1,
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "DL-02-XY-5555",
      count: 1,
    });
    // Different user — should be filtered out.
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "200",
      vehicleNumber: "WB-03-CC-9999",
      count: 1,
    });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: {},
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(2);
    expect(res._body.body.data.data).toHaveLength(2);
  });

  it("filters by vehicleNumber regex (case-insensitive)", async () => {
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "MH-01-AB-1234",
      count: 1,
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "DL-02-XY-5555",
      count: 1,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { vehicleNumber: "mh-01" },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].vehicleNumber).toBe("MH-01-AB-1234");
  });

  it("honours skip/limit pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await VehicleDetectionIncident.create({
        timeOfIncident: new Date(Date.now() - i * 1000),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "100",
        vehicleNumber: `V-${i}`,
        count: 1,
      });
    }
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { skip: "1", limit: "2" },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(5);
    expect(res._body.body.data.data).toHaveLength(2);
  });

  it("filters by startDate / endDate window", async () => {
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date("2024-06-15T12:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "IN-RANGE",
      count: 1,
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date("2020-01-01T12:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "OUT-OF-RANGE",
      count: 1,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { startDate: "2024-06-01", endDate: "2024-06-30" },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].vehicleNumber).toBe("IN-RANGE");
  });

  it("filters by severity / resolved / reportStatus", async () => {
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "A",
      count: 1,
      severity: "high",
      resolved: true,
      report: { status: true },
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "B",
      count: 1,
      severity: "low",
      resolved: false,
      report: { status: false },
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: {
        severity: "high",
        resolved: "true",
        reportStatus: "true",
      },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].vehicleNumber).toBe("A");
  });

  it("filters by a single nvrId and a comma-separated nvrIds list", async () => {
    const nvr1 = new mongoose.Types.ObjectId();
    const nvr2 = new mongoose.Types.ObjectId();
    const nvr3 = new mongoose.Types.ObjectId();
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: nvr1,
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "N1",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: nvr2,
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "N2",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: nvr3,
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "N3",
    });

    // Single nvrId.
    {
      const { req, res, next } = serviceCtx({
        user_id: "100",
        query: { nvrId: nvr1.toString() },
      });
      await IncidentsService.getVehicleDetectionLogs(req, res, next);
      expect(res._body.body.data.totalCount).toBe(1);
    }
    // Multi nvrIds.
    {
      const { req, res, next } = serviceCtx({
        user_id: "100",
        query: { nvrIds: `${nvr1.toString()},${nvr2.toString()}` },
      });
      await IncidentsService.getVehicleDetectionLogs(req, res, next);
      expect(res._body.body.data.totalCount).toBe(2);
    }
  });

  it("restricts results to authorizedChannels when set on the request", async () => {
    const ch1 = new mongoose.Types.ObjectId();
    const ch2 = new mongoose.Types.ObjectId();
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: ch1,
      userId: "100",
      vehicleNumber: "AC1",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: ch2,
      userId: "100",
      vehicleNumber: "AC2",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      authorizedChannel: { channels: [ch1] },
      query: {},
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].vehicleNumber).toBe("AC1");
  });

  it("intersects channelId param with authorizedChannels", async () => {
    const ch1 = new mongoose.Types.ObjectId();
    const ch2 = new mongoose.Types.ObjectId();
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: ch1,
      userId: "100",
      vehicleNumber: "X1",
    });
    // authorizedChannels = [ch1], requested channelIds = ch2 → empty intersection
    const { req, res, next } = serviceCtx({
      user_id: "100",
      authorizedChannel: { channels: [ch1] },
      query: { channelIds: ch2.toString() },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(0);
  });

  it("applies search across incidentName / description / zone / vehicleNumber", async () => {
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "SEARCH-HIT",
      incidentName: "Other",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "OTHER",
      incidentName: "miss",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { search: "search-hit" },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].vehicleNumber).toBe("SEARCH-HIT");
  });
});

// ----------------------------------------------------------------------------
// getVehicleNumbers
// ----------------------------------------------------------------------------

describe("IncidentsService.getVehicleNumbers", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getVehicleNumbers(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns distinct vehicle numbers (no nulls/empties) for the user", async () => {
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "AA-11",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "AA-11",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "BB-22",
    });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      vehicleNumber: "",
    });
    // Different user — excluded.
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "200",
      vehicleNumber: "ZZ-99",
    });

    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: {},
    });
    await IncidentsService.getVehicleNumbers(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(2);
    expect(res._body.body.data.vehicleNumbers).toEqual(
      expect.arrayContaining(["AA-11", "BB-22"]),
    );
    expect(res._body.body.data.vehicleNumbers).not.toContain("");
    expect(res._body.body.data.vehicleNumbers).not.toContain("ZZ-99");
  });
});

// ----------------------------------------------------------------------------
// getConveyorDetectionLogs
// ----------------------------------------------------------------------------

describe("IncidentsService.getConveyorDetectionLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getConveyorDetectionLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns all conveyorDetection rows by default", async () => {
    await ConveyorDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "ON",
    });
    await ConveyorDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "OFF",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: {},
    });
    await IncidentsService.getConveyorDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(2);
  });

  it("filters by status=ON (and case-insensitively)", async () => {
    await ConveyorDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "ON",
    });
    await ConveyorDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "OFF",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { status: "on" },
    });
    await IncidentsService.getConveyorDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].currentStatus).toBe("ON");
  });

  it("ignores invalid status values (falls through to no extra filter)", async () => {
    await ConveyorDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "ON",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { status: "banana" },
    });
    await IncidentsService.getConveyorDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// getCrusherDetectionLogs
// ----------------------------------------------------------------------------

describe("IncidentsService.getCrusherDetectionLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getCrusherDetectionLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("filters crusher rows by status=OFF", async () => {
    await CrusherDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "ON",
    });
    await CrusherDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "OFF",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { status: "OFF" },
    });
    await IncidentsService.getCrusherDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].currentStatus).toBe("OFF");
  });
});

// ----------------------------------------------------------------------------
// getWaterSpillageDetectionLogs
// ----------------------------------------------------------------------------

describe("IncidentsService.getWaterSpillageDetectionLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getWaterSpillageDetectionLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("filters water-spillage rows by status=DETECTED", async () => {
    await WaterSpillageDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "DETECTED",
    });
    await WaterSpillageDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "CLEAR",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { status: "detected" },
    });
    await IncidentsService.getWaterSpillageDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].currentStatus).toBe("DETECTED");
  });

  it("ignores invalid status filter values", async () => {
    await WaterSpillageDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      currentStatus: "DETECTED",
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { status: "MAYBE" },
    });
    await IncidentsService.getWaterSpillageDetectionLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
  });
});

// ----------------------------------------------------------------------------
// getVehicleCountLogs
// ----------------------------------------------------------------------------

describe("IncidentsService.getVehicleCountLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getVehicleCountLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns all countVehicles rows for the user", async () => {
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 5,
    });
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 12,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: {},
    });
    await IncidentsService.getVehicleCountLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(2);
  });

  it("filters by minCount", async () => {
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 5,
    });
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 12,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { minCount: "10" },
    });
    await IncidentsService.getVehicleCountLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].count).toBe(12);
  });

  it("filters by both minCount and maxCount", async () => {
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 3,
    });
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 8,
    });
    await CountVehiclesIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      count: 20,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { minCount: "5", maxCount: "15" },
    });
    await IncidentsService.getVehicleCountLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].count).toBe(8);
  });
});

// ----------------------------------------------------------------------------
// getLineCrossingLogs
// ----------------------------------------------------------------------------

describe("IncidentsService.getLineCrossingLogs", () => {
  it("rejects without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getLineCrossingLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns lineCrossing rows for the user", async () => {
    await LineCrossingAuthIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      atoB: 3,
      btoA: 2,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: {},
    });
    await IncidentsService.getLineCrossingLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.body.data.totalCount).toBe(1);
  });

  it("filters by atoB range", async () => {
    await LineCrossingAuthIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      atoB: 1,
      btoA: 0,
    });
    await LineCrossingAuthIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      atoB: 5,
      btoA: 0,
    });
    await LineCrossingAuthIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      atoB: 10,
      btoA: 0,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { minAtoB: "2", maxAtoB: "8" },
    });
    await IncidentsService.getLineCrossingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].atoB).toBe(5);
  });

  it("filters by btoA range", async () => {
    await LineCrossingAuthIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      atoB: 0,
      btoA: 4,
    });
    await LineCrossingAuthIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "100",
      atoB: 0,
      btoA: 20,
    });
    const { req, res, next } = serviceCtx({
      user_id: "100",
      query: { minBtoA: "10" },
    });
    await IncidentsService.getLineCrossingLogs(req, res, next);
    expect(res._body.body.data.totalCount).toBe(1);
    expect(res._body.body.data.data[0].btoA).toBe(20);
  });
});
