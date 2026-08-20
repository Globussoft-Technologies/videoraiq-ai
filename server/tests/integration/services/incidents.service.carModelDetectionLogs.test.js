/**
 * IncidentsService.getCarModelDetectionLogs — the endpoint behind Car Logs.
 *
 * The page renders Model Name, Company, Colour and Year, all of which live on
 * the carModelDetection discriminator and come down in the row payload (the
 * aggregation has no $project narrowing the incident doc). These tests pin
 * that down, plus the two things that used to hide those columns:
 *   - free-text `search` never reached the caller's searchFields on the
 *     postLookupSearch path, so company/colour/model/year were unsearchable;
 *   - `sortField`/`sortOrder` were sent by the page but never read, so every
 *     column header sorted by nothing.
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
const { CarModelDetectionIncident } = await import(
  "../../../core/v1/incidents/incidents.model.js"
);

const USER_ID = "900";

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

const seedCar = ({
  userId = USER_ID,
  nvrId = new mongoose.Types.ObjectId(),
  channelId = new mongoose.Types.ObjectId(),
  timeOfIncident = new Date("2026-08-20T10:00:00Z"),
  model_name = "CITY",
  color = "white",
  company = "Honda",
  year = 2021,
} = {}) =>
  CarModelDetectionIncident.create({
    timeOfIncident,
    nvrId,
    channelId,
    userId,
    incidentName: "Car Model Detection",
    severity: "high",
    model_name,
    color,
    company,
    year,
  });

const fetchLogs = async (query = {}) => {
  const { req, res, next } = serviceCtx({ user_id: USER_ID, query });
  await IncidentsService.getCarModelDetectionLogs(req, res, next);
  return payload(res);
};

describe("IncidentsService.getCarModelDetectionLogs", () => {
  it("returns colour, company and year on every row", async () => {
    await seedCar({ model_name: "AMAZE", color: "red", company: "Honda", year: 2019 });

    const body = await fetchLogs();

    expect(body.status).toBe("success");
    expect(body.data.totalCount).toBe(1);
    const [row] = body.data.data;
    expect(row.model_name).toBe("AMAZE");
    expect(row.color).toBe("red");
    expect(row.company).toBe("Honda");
    expect(row.year).toBe(2019);
  });

  it("keeps a row whose attributes were never sent, with nulls rather than dropping it", async () => {
    await CarModelDetectionIncident.create({
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      model_name: "CITY",
    });

    const [row] = (await fetchLogs()).data.data;
    expect(row.model_name).toBe("CITY");
    expect(row.color).toBeNull();
    expect(row.company).toBeNull();
    expect(row.year).toBeNull();
  });

  describe("free-text search", () => {
    beforeEach(async () => {
      await seedCar({ model_name: "CITY", color: "white", company: "Honda", year: 2021 });
      await seedCar({ model_name: "SWIFT", color: "black", company: "Maruti", year: 2018 });
    });

    it("matches on company", async () => {
      const body = await fetchLogs({ search: "maruti" });
      expect(body.data.totalCount).toBe(1);
      expect(body.data.data[0].model_name).toBe("SWIFT");
    });

    it("matches on colour", async () => {
      const body = await fetchLogs({ search: "whi" });
      expect(body.data.totalCount).toBe(1);
      expect(body.data.data[0].color).toBe("white");
    });

    it("matches on model name", async () => {
      const body = await fetchLogs({ search: "swi" });
      expect(body.data.totalCount).toBe(1);
      expect(body.data.data[0].model_name).toBe("SWIFT");
    });

    it("matches on year, which is stored as a number", async () => {
      const body = await fetchLogs({ search: "2018" });
      expect(body.data.totalCount).toBe(1);
      expect(body.data.data[0].year).toBe(2018);
    });

    it("returns nothing for a term no column matches", async () => {
      const body = await fetchLogs({ search: "nothing-matches-this" });
      expect(body.data.totalCount).toBe(0);
    });
  });

  describe("sorting", () => {
    beforeEach(async () => {
      await seedCar({
        model_name: "CITY",
        company: "Honda",
        color: "white",
        year: 2021,
        timeOfIncident: new Date("2026-08-20T09:00:00Z"),
      });
      await seedCar({
        model_name: "SWIFT",
        company: "Maruti",
        color: "black",
        year: 2018,
        timeOfIncident: new Date("2026-08-20T11:00:00Z"),
      });
    });

    it("defaults to newest first when no sortField is sent", async () => {
      const rows = (await fetchLogs()).data.data;
      expect(rows.map((r) => r.model_name)).toEqual(["SWIFT", "CITY"]);
    });

    it("sorts by company", async () => {
      const asc = (await fetchLogs({ sortField: "company", sortOrder: "asc" })).data.data;
      expect(asc.map((r) => r.company)).toEqual(["Honda", "Maruti"]);

      const desc = (await fetchLogs({ sortField: "company", sortOrder: "desc" })).data.data;
      expect(desc.map((r) => r.company)).toEqual(["Maruti", "Honda"]);
    });

    it("sorts by year", async () => {
      const rows = (await fetchLogs({ sortField: "year", sortOrder: "asc" })).data.data;
      expect(rows.map((r) => r.year)).toEqual([2018, 2021]);
    });

    it("maps the UI column id modelName onto the stored model_name", async () => {
      const rows = (await fetchLogs({ sortField: "modelName", sortOrder: "asc" })).data.data;
      expect(rows.map((r) => r.model_name)).toEqual(["CITY", "SWIFT"]);
    });

    it("ignores an unknown sortField instead of sorting by it", async () => {
      const rows = (await fetchLogs({ sortField: "$where", sortOrder: "asc" })).data.data;
      expect(rows.map((r) => r.model_name)).toEqual(["SWIFT", "CITY"]);
    });

    it("keeps totalCount and the page consistent while sorted", async () => {
      const body = await fetchLogs({ sortField: "color", sortOrder: "asc", limit: 1 });
      expect(body.data.totalCount).toBe(2);
      expect(body.data.data).toHaveLength(1);
      expect(body.data.data[0].color).toBe("black");
    });
  });
});
