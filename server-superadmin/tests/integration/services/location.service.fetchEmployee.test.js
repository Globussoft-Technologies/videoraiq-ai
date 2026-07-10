/**
 * Integration test for LocationService.fetchEmployeeLocation — the
 * previously-uncovered endpoint that returns Location docs whose names match
 * any non-empty `location` value found on authorizedUsers. Also exercises the
 * `memberId` branch of the Location pre-find hook, which scopes results to the
 * member's authorizedChannels.employeeLocations.
 *
 * No mocks — straight against in-memory MongoDB.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: LocationService } = await import(
  "../../../core/v1/locations/location.service.js"
);
const { default: Location } = await import(
  "../../../core/v1/locations/location.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: AuthorizedChannels } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);

let adminId;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  adminId = new mongoose.Types.ObjectId();
});

async function seedEmployee(loc) {
  return AuthorizedUsers.create({
    adminId,
    firstName: "Emp",
    lastName: "Z",
    email: `emp+${Math.random()}@test.com`,
    location: loc,
  });
}

async function seedLocation(name, over = {}) {
  return Location.create({
    locationName: name,
    adminId,
    ...over,
  });
}

describe("LocationService.fetchEmployeeLocation", () => {
  it("returns 400 when no admin context is attached", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns an empty list when no authorized users have a location", async () => {
    await seedEmployee("");
    await seedEmployee(null);
    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(0);
    expect(payload(res).data.locations).toEqual([]);
  });

  it("returns the Location docs for the admin", async () => {
    // Seed employees so the distinct() call returns at least one non-empty
    // value (the service short-circuits otherwise).
    await seedEmployee("HQ");
    await seedEmployee("Branch");
    // Seed the matching Location docs.
    await seedLocation("HQ");
    await seedLocation("Branch");
    await seedLocation("UnrelatedLocation"); // belongs to admin, no employee uses it

    const { req, res, next } = serviceCtx({ adminId, query: {} });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    // The service filters Location docs by `adminId` only; all three docs are
    // returned. (The validLocations list is computed but only used as
    // `regexLocations` further down — and that result is currently unused.)
    expect(payload(res).data.totalCount).toBe(3);
    expect(payload(res).data.locations).toHaveLength(3);
  });

  it("filters by `search` against locationName / empLocationId", async () => {
    await seedEmployee("HQ");
    await seedLocation("HQ", { empLocationId: "L-001" });
    await seedLocation("Branch", { empLocationId: "L-002" });
    await seedLocation("Office", { empLocationId: "L-003" });

    const { req, res, next } = serviceCtx({
      adminId,
      query: { search: "branch" },
    });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.locations[0].locationName).toBe("Branch");

    // Searching by empLocationId should also work.
    const ctx2 = serviceCtx({
      adminId,
      query: { search: "L-003" },
    });
    await LocationService.fetchEmployeeLocation(ctx2.req, ctx2.res, ctx2.next);
    expect(payload(ctx2.res).data.locations[0].locationName).toBe("Office");
  });

  it("honours skip / limit", async () => {
    await seedEmployee("HQ");
    for (let i = 0; i < 5; i++) {
      await seedLocation(`Loc-${i}`);
    }
    const { req, res, next } = serviceCtx({
      adminId,
      query: { skip: 1, limit: 2 },
    });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations).toHaveLength(2);
    // totalCount is the un-paginated count.
    expect(payload(res).data.totalCount).toBe(5);
  });

  it("scopes results when a member's authorizedChannels.employeeLocations is set", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await AuthorizedChannels.create({
      userId: memberId,
      adminId,
      employeeLocations: ["HQ"],
      // The Location pre-find hook only consults `employeeLocations` here.
    });
    await seedEmployee("HQ");
    await seedEmployee("Branch");
    await seedLocation("HQ");
    await seedLocation("Branch");

    const { req, res, next } = serviceCtx({
      adminId,
      memberId,
      query: {},
    });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    // Only the HQ location is allowed for this member.
    expect(payload(res).data.locations).toHaveLength(1);
    expect(payload(res).data.locations[0].locationName).toBe("HQ");
  });

  it("returns zero rows when a member's authorizedChannels.employeeLocations is empty", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await AuthorizedChannels.create({
      userId: memberId,
      adminId,
      employeeLocations: [],
    });
    await seedEmployee("HQ");
    await seedLocation("HQ");
    await seedLocation("Branch");

    const { req, res, next } = serviceCtx({
      adminId,
      memberId,
      query: {},
    });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations).toHaveLength(0);
  });
});
