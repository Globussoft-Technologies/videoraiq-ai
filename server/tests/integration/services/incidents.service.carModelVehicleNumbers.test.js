import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

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
  withSFTPConnection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsService } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { CarModelDetectionIncident, VehicleDetectionIncident } = await import(
  "../../../core/v1/incidents/incidents.model.js"
);

const USER_ID = "car-model-user";

const seedCarModelIncident = (vehicleNumber, overrides = {}) =>
  CarModelDetectionIncident.create({
    timeOfIncident: new Date("2020-01-01T00:00:00.000Z"),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: USER_ID,
    vehicleNumber,
    model_name: "CITY",
    ...overrides,
  });

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

describe("IncidentsService.getCarModelVehicleNumbers", () => {
  it("rejects a request without an authenticated user_id", async () => {
    const { req, res, next } = serviceCtx();

    await IncidentsService.getCarModelVehicleNumbers(req, res, next);

    expect(payload(res).status).toBe("failed");
  });

  it("returns unique non-empty numbers from every car-model incident for only that user", async () => {
    await seedCarModelIncident("KA01AB1234");
    await seedCarModelIncident(" ka01ab1234 ", {
      timeOfIncident: new Date("2026-08-26T00:00:00.000Z"),
    });
    await seedCarModelIncident("MH02CD5678");
    await seedCarModelIncident("");
    await seedCarModelIncident("   ");
    await seedCarModelIncident("OTHER-USER", { userId: "another-user" });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      vehicleNumber: "VEHICLE-DETECTION-ONLY",
    });

    const { req, res, next } = serviceCtx({ user_id: USER_ID });
    await IncidentsService.getCarModelVehicleNumbers(req, res, next);

    const body = payload(res);
    expect(res.statusCode).toBe(200);
    expect(body.data.totalCount).toBe(2);
    expect(body.data.vehicleNumbers).toEqual([
      "KA01AB1234",
      "MH02CD5678",
    ]);
  });
});

describe("IncidentsService.getCarModelDetectionLogs vehicleNumber filter", () => {
  it("returns only car-model incidents partially matching the vehicle number", async () => {
    await seedCarModelIncident("KA01AB1234");
    await seedCarModelIncident("MH02CD5678");

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      query: { vehicleNumber: "ka01ab", skip: 0, limit: 12 },
    });
    await IncidentsService.getCarModelDetectionLogs(req, res, next);

    const body = payload(res);
    expect(res.statusCode).toBe(200);
    expect(body.data.totalCount).toBe(1);
    expect(body.data.data[0].vehicleNumber).toBe("KA01AB1234");
  });
});
