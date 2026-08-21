/**
 * End-to-end coverage for the vehicle-number → registered-user tagging that
 * ANPR Logs and Vehicle Detection incidents share:
 *
 *   - `taggedUser` enrichment on getVehicleDetectionLogs / getAllIncidents
 *   - the all / tagged / untagged (`tagStatus`) filter
 *   - free-text search matching a plate OR the tagged user's name
 *
 * Runs against a real in-memory Mongo, because the filter is implemented as
 * aggregation stages (`$replaceAll` plate normalisation) that a mocked model
 * would not exercise at all.
 *
 * Mocks: 4 (alerts, socket, SFTP connection check, jobs service) — the same
 * stubs the rest of the incidents suite uses.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
  withSFTPConnection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);
const { VehicleDetectionIncident } = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { default: authorizedUsersModel } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
// V2 shares V1's models but has its own getAllIncidents, which is the one the
// V2 Incident Center calls and the only one that returns the chip `counts`.
const { default: IncidentsServiceV2 } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);

const USER_ID = "100";
const ADMIN_ID = new mongoose.Types.ObjectId();

/** A vehicleDetection incident carrying `vehicleNumber`. */
const seedDetection = (vehicleNumber, overrides = {}) =>
  VehicleDetectionIncident.create({
    timeOfIncident: new Date(),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: USER_ID,
    incidentName: "Vehicle Detection",
    Image: "/uploads/x.jpg",
    severity: "low",
    resolved: false,
    vehicleNumber,
    count: 1,
    ...overrides,
  });

const seedUser = (firstName, lastName, vehicleNumber) =>
  authorizedUsersModel.create({
    adminId: ADMIN_ID,
    firstName,
    lastName,
    userName: `${firstName} ${lastName}`,
    email: `${firstName}.${lastName}@example.com`.toLowerCase(),
    vehicleNumber,
  });

/** ANPR Logs request context. */
const logsCtx = (query = {}) =>
  serviceCtx({ adminId: ADMIN_ID, user_id: USER_ID, query: { skip: 0, limit: 50, ...query } });

/** Incident Center request context. */
const centerCtx = (body = {}) =>
  serviceCtx({
    adminId: ADMIN_ID,
    user_id: USER_ID,
    query: { skip: 0, limit: 50 },
    body: { statusFilter: ["new", "reported", "resolved"], ...body },
  });

const plates = (res) => payload(res).data.data.map((r) => r.vehicleNumber).sort();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("getVehicleDetectionLogs — taggedUser enrichment", () => {
  it("names the owner regardless of how either side formats the plate", async () => {
    await seedUser("Asha", "Rao", "KA 02 MP 9657");
    await seedDetection("ka02mp9657");

    const { req, res, next } = logsCtx();
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    const [row] = payload(res).data.data;
    expect(row.taggedUser).toMatchObject({ firstName: "Asha", lastName: "Rao" });
  });

  it("leaves an unclaimed plate untagged so the UI offers Tag User", async () => {
    await seedDetection("KA05XY1111");

    const { req, res, next } = logsCtx();
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.data[0].taggedUser).toBeNull();
  });

  it("does not leak a plate tagged under a different admin", async () => {
    await authorizedUsersModel.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Other",
      lastName: "Tenant",
      userName: "Other Tenant",
      vehicleNumber: "KA02MP9657",
    });
    await seedDetection("KA02MP9657");

    const { req, res, next } = logsCtx();
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.data[0].taggedUser).toBeNull();
  });
});

describe("getVehicleDetectionLogs — tagStatus filter", () => {
  beforeEach(async () => {
    await seedUser("Asha", "Rao", "KA02MP9657");
    await seedDetection("KA02MP9657"); // tagged
    await seedDetection("KA05XY1111"); // not tagged
    await seedDetection(null); // no plate read at all
  });

  it("returns everything when the filter is absent or 'all'", async () => {
    for (const tagStatus of [undefined, "all"]) {
      const { req, res, next } = logsCtx(tagStatus ? { tagStatus } : {});
      await IncidentsService.getVehicleDetectionLogs(req, res, next);
      expect(payload(res).data.totalCount).toBe(3);
    }
  });

  it("'tagged' returns only plates that belong to a user", async () => {
    const { req, res, next } = logsCtx({ tagStatus: "tagged" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.totalCount).toBe(1);
    expect(plates(res)).toEqual(["KA02MP9657"]);
  });

  it("'untagged' returns the rest, including detections with no plate", async () => {
    const { req, res, next } = logsCtx({ tagStatus: "untagged" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.totalCount).toBe(2);
    // Array.sort() stringifies, so null lands after the plate.
    expect(plates(res)).toEqual(["KA05XY1111", null]);
  });

  it("keeps totalCount in step with the filtered page", async () => {
    // totalCount comes from a separate $count aggregation; if the tagging
    // stages only reached one of the two, pagination would report a page size
    // it can never fill.
    const { req, res, next } = logsCtx({ tagStatus: "tagged", limit: 1 });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.data).toHaveLength(1);
  });

  it("never returns the internal normalised-plate helper field", async () => {
    const { req, res, next } = logsCtx({ tagStatus: "tagged" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.data[0]).not.toHaveProperty("_normPlate");
  });
});

describe("getVehicleDetectionLogs — search by plate or tagged user", () => {
  beforeEach(async () => {
    await seedUser("Asha", "Rao", "KA02MP9657");
    await seedUser("Vikram", "Singh", "KA05XY1111");
    await seedDetection("KA02MP9657");
    await seedDetection("KA05XY1111");
    await seedDetection("KA09ZZ2222"); // untagged
  });

  it("finds a detection by the tagged user's first name", async () => {
    const { req, res, next } = logsCtx({ search: "Asha" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(plates(res)).toEqual(["KA02MP9657"]);
  });

  it("finds a detection by the tagged user's last name", async () => {
    const { req, res, next } = logsCtx({ search: "Singh" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(plates(res)).toEqual(["KA05XY1111"]);
  });

  it("still finds a detection by its plate, tagged or not", async () => {
    const { req, res, next } = logsCtx({ search: "KA09ZZ2222" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(plates(res)).toEqual(["KA09ZZ2222"]);
  });

  it("returns nothing for a name nobody has", async () => {
    const { req, res, next } = logsCtx({ search: "Nobody" });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);

    expect(payload(res).data.totalCount).toBe(0);
  });
});

describe("getAllIncidents — Incident Center tagging", () => {
  beforeEach(async () => {
    await seedUser("Asha", "Rao", "KA02MP9657");
    await seedDetection("KA02MP9657");
    await seedDetection("KA05XY1111");
  });

  it("attaches taggedUser to Vehicle Detection incidents", async () => {
    const { req, res, next } = centerCtx();
    await IncidentsService.getAllIncidents(req, res, next);

    const rows = payload(res).data;
    const tagged = rows.find((r) => r.vehicleNumber === "KA02MP9657");
    expect(tagged.taggedUser).toMatchObject({ firstName: "Asha" });
    expect(rows.find((r) => r.vehicleNumber === "KA05XY1111").taggedUser).toBeNull();
  });

  it("filters by tagStatus", async () => {
    const tagged = centerCtx({ tagStatus: "tagged" });
    await IncidentsService.getAllIncidents(tagged.req, tagged.res, tagged.next);
    expect(payload(tagged.res).data.map((r) => r.vehicleNumber)).toEqual(["KA02MP9657"]);

    const untagged = centerCtx({ tagStatus: "untagged" });
    await IncidentsService.getAllIncidents(untagged.req, untagged.res, untagged.next);
    expect(payload(untagged.res).data.map((r) => r.vehicleNumber)).toEqual(["KA05XY1111"]);
  });

  it("searches by tagged user name and by plate", async () => {
    const byName = centerCtx({ search: "Asha" });
    await IncidentsService.getAllIncidents(byName.req, byName.res, byName.next);
    expect(payload(byName.res).data.map((r) => r.vehicleNumber)).toEqual(["KA02MP9657"]);

    const byPlate = centerCtx({ search: "KA05" });
    await IncidentsService.getAllIncidents(byPlate.req, byPlate.res, byPlate.next);
    expect(payload(byPlate.res).data.map((r) => r.vehicleNumber)).toEqual(["KA05XY1111"]);
  });

  it("keeps totalCount in step with the filter", async () => {
    const { req, res, next } = centerCtx({ tagStatus: "tagged" });
    await IncidentsService.getAllIncidents(req, res, next);

    expect(payload(res).totalCount).toBe(1);
  });

  it("V2: the severity/status chip counts follow the filter too", async () => {
    // The chips come from a second aggregation. If the tagging stages reached
    // only the grid query, the chips would keep advertising rows the filter
    // has already removed.
    const { req, res, next } = centerCtx({ tagStatus: "tagged" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    const body = payload(res);
    expect(body.totalCount).toBe(1);
    expect(body.counts.status.all).toBe(1);
    expect(body.counts.severity.all).toBe(1);
    expect(body.data.map((r) => r.vehicleNumber)).toEqual(["KA02MP9657"]);
  });

  it("leaves the unfiltered feed untouched", async () => {
    const { req, res, next } = centerCtx();
    await IncidentsService.getAllIncidents(req, res, next);

    expect(payload(res).totalCount).toBe(2);
    expect(payload(res).data[0]).not.toHaveProperty("_normPlate");
  });
});
