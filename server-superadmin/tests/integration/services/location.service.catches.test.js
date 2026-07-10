/**
 * LocationService — outer-catch / 500 arms.
 *
 * Existing tests (location.service.test.js, location.service.fetchEmployee.test.js)
 * cover all happy-paths plus the 400/404/409 validation short-circuits, but they
 * never enter the final `catch (error)` blocks on:
 *   - deleteLocation         (lines 229-232)
 *   - fetchEmployeeLocation  (lines 281-284)
 *
 * Both branches log via `logger.error(error)` and respond with
 * `res.status(500).json(Response.errorResp("Failed to …", error.message))`.
 * They're only reachable when the model layer (Location/AuthorizedUsers) throws
 * mid-handler — vi.spyOn(...).mockImplementationOnce(throw) is the standard
 * pattern used by detectionSettings.service.catches.test.js.
 *
 * Strategy:
 *   - In-memory MongoDB for the seed rows used by deleteLocation's
 *     findOneAndDelete first call (so we reach the cascade branch and can
 *     then make `authorizedUsersModel.updateMany` throw).
 *   - vi.spyOn(model, 'method').mockImplementationOnce(() => throw) to force
 *     each outer catch.
 *   - Spies are restored per-test via `afterEach(() => vi.restoreAllMocks())`.
 *
 * Mocks used: 0 vi.mock (spies don't count against the 8-mock budget).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
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
afterEach(() => {
  // Restore any spies installed for catch-path tests.
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// deleteLocation — outer-catch 500 arm (lines 229-232)
// ---------------------------------------------------------------------------
describe("LocationService.deleteLocation — outer catch", () => {
  it("returns 500 when Location.findOneAndDelete throws", async () => {
    // First model call inside the try block — easiest spot to inject.
    vi.spyOn(Location, "findOneAndDelete").mockImplementationOnce(() => {
      throw new Error("findOneAndDelete-boom");
    });
    const id = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = serviceCtx({
      adminId,
      query: { id },
    });
    await LocationService.deleteLocation(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to delete location/);
    // Single arg to errorResp's second slot = the error.message string.
    expect(payload(res).error).toBe("findOneAndDelete-boom");
  });

  it("returns 500 when the post-delete cascade (authorizedUsers.updateMany) throws", async () => {
    // Seed a real location so findOneAndDelete + the 'default' lookup both
    // succeed and the cascade arm at lines 215-225 actually runs. Then make
    // the AuthorizedUsers.updateMany call inside that arm throw — exercises
    // the deeper-in-the-try-block branch of the same outer catch.
    const loc = await Location.create({
      locationName: "Engineering",
      adminId,
    });
    // Also seed a 'default' so the cascade arm is entered (oldName !==
    // fallbackName).
    await Location.create({ locationName: "default", adminId });

    vi.spyOn(AuthorizedUsers, "updateMany").mockImplementationOnce(() => {
      throw new Error("cascade-updateMany-boom");
    });

    const { req, res, next } = serviceCtx({
      adminId,
      query: { id: loc._id.toString() },
    });
    await LocationService.deleteLocation(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(/Failed to delete location/);
    expect(payload(res).error).toBe("cascade-updateMany-boom");
  });
});

// ---------------------------------------------------------------------------
// fetchEmployeeLocation — outer-catch 500 arm (lines 281-284)
// ---------------------------------------------------------------------------
describe("LocationService.fetchEmployeeLocation — outer catch", () => {
  it("returns 500 when AuthorizedUsers.distinct throws", async () => {
    // First model call in the handler is authorizedUsersModel.distinct(...).
    vi.spyOn(AuthorizedUsers, "distinct").mockImplementationOnce(() => {
      throw new Error("distinct-boom");
    });
    const { req, res, next } = serviceCtx({
      adminId,
      query: {},
    });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(
      /Failed to fetch locations in service/,
    );
    expect(payload(res).error).toBe("distinct-boom");
  });

  it("returns 500 when Location.find (the paginated query) throws after a successful distinct", async () => {
    // Seed at least one authorizedUser with a non-empty location so the
    // distinct call returns a non-empty array and execution reaches the
    // Promise.all([locationModel.find(...), locationModel.find(...)]) block.
    await AuthorizedUsers.create({
      adminId,
      firstName: "Emp",
      lastName: "Z",
      email: `emp-catch-${Date.now()}@test.com`,
      location: "Floor-1",
    });

    vi.spyOn(Location, "find").mockImplementationOnce(() => {
      // Mongoose `.find()` returns a chainable Query, but throwing
      // synchronously inside `Promise.all([...])` rejects the Promise — the
      // outer try/catch swallows it.
      throw new Error("location-find-boom");
    });

    const { req, res, next } = serviceCtx({
      adminId,
      query: { skip: 0, limit: 10 },
    });
    await LocationService.fetchEmployeeLocation(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).message).toMatch(
      /Failed to fetch locations in service/,
    );
    expect(payload(res).error).toBe("location-find-boom");
  });
});
