/**
 * Integration tests for the pre("/^find|countDocuments/") access-control
 * hooks on Location and Department models. These hooks consult
 * authorizedChannels and either allow-all, narrow the query, or block
 * results entirely. Existing model tests only cover the
 * "no memberId → bypass" branch; this file covers the memberId branches.
 *
 * Pure DB-driven — no service mocks (mock budget 0/8).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../dbSetup.js";

const { default: Location } = await import(
  "../../../core/v1/locations/location.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
const { default: AuthorizedChannels } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
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

// ---------------------------------------------------------------------------
// Location pre-find hook — gated by options.memberId
// ---------------------------------------------------------------------------

describe("Location pre-find access hook", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("returns full results when no authorizedChannels record exists for the member", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Location.create({ adminId, locationName: "A" });
    await Location.create({ adminId, locationName: "B" });

    // No AuthorizedChannels doc → hook bails out at the !authorized branch.
    const results = await Location.find({}).setOptions({ memberId });
    expect(results).toHaveLength(2);
  });

  it("blocks all results when allowedLocations is empty (employee path)", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Location.create({ adminId, locationName: "A" });
    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["nvr-only"],
      employeeLocations: [], // empty -> block
    });

    const results = await Location.find({}).setOptions({ memberId });
    expect(results).toEqual([]);
  });

  it("restricts to locations.user=='nvr' branch when user option is 'nvr'", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Location.create({ adminId, locationName: "HQ" });
    await Location.create({ adminId, locationName: "Branch" });
    await Location.create({ adminId, locationName: "Warehouse" });

    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["HQ", "Branch"],
      employeeLocations: ["Other"],
    });

    const results = await Location.find({}).setOptions({
      memberId,
      user: "nvr",
    });
    const names = results.map((l) => l.locationName).sort();
    expect(names).toEqual(["Branch", "HQ"]);
  });

  it("restricts to employeeLocations branch when user is not 'nvr'", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Location.create({ adminId, locationName: "HQ" });
    await Location.create({ adminId, locationName: "Branch" });
    await Location.create({ adminId, locationName: "Warehouse" });

    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["HQ"],
      employeeLocations: ["Warehouse"],
    });

    // No `user` flag → falls through to employeeLocations branch.
    const results = await Location.find({}).setOptions({ memberId });
    const names = results.map((l) => l.locationName);
    expect(names).toEqual(["Warehouse"]);
  });

  it("countDocuments goes through the same hook (blocks when empty)", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Location.create({ adminId, locationName: "A" });
    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["X"],
      employeeLocations: [],
    });

    const count = await Location.countDocuments({}).setOptions({ memberId });
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Department pre-find hook — derives allowed dept ids from
// authorized.departmentIds, plus the dept ids of authorized users in
// authorized.locations ∪ authorized.employeeLocations.
// ---------------------------------------------------------------------------

describe("Department pre-find access hook", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("returns all when no authorizedChannels record exists for the member", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Department.create({ adminId, departmentName: "eng" });
    await Department.create({ adminId, departmentName: "hr" });

    const results = await Department.find({}).setOptions({ memberId });
    expect(results).toHaveLength(2);
  });

  it("blocks all when the authorized record has no allowed depts and no locations", async () => {
    const memberId = new mongoose.Types.ObjectId();
    await Department.create({ adminId, departmentName: "eng" });
    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["unmatched"],
      employeeLocations: [],
      departmentIds: [],
    });

    // Allowed = [] (no dept ids, no users in the locations). uniqueLocations
    // has one entry → it queries authorizedUsers (finds none) → allowed
    // stays empty → block branch hits.
    const results = await Department.find({}).setOptions({ memberId });
    expect(results).toEqual([]);
  });

  it("filters to authorized.departmentIds when no locations are configured", async () => {
    const memberId = new mongoose.Types.ObjectId();
    const dEng = await Department.create({ adminId, departmentName: "eng" });
    await Department.create({ adminId, departmentName: "hr" });
    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: [],
      employeeLocations: [],
      departmentIds: [dEng._id],
    });

    // No locations → uniqueLocations.length === 0 → skips authorizedUsers
    // lookup → allowed comes from authorized.departmentIds only.
    const results = await Department.find({}).setOptions({ memberId });
    expect(results.map((d) => d.departmentName)).toEqual(["eng"]);
  });

  it("merges authorized.departmentIds with dept ids derived from authorizedUsers in allowed locations", async () => {
    const memberId = new mongoose.Types.ObjectId();
    const dEng = await Department.create({ adminId, departmentName: "eng" });
    const dHR = await Department.create({ adminId, departmentName: "hr" });
    await Department.create({ adminId, departmentName: "ops" });

    // Authorized user assigned to dHR in location "Mumbai".
    await AuthorizedUsers.create({
      adminId,
      firstName: "U",
      lastName: "1",
      email: "u1@t.test",
      location: "Mumbai",
      departmentId: dHR._id,
    });

    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["Mumbai"],
      employeeLocations: [],
      departmentIds: [dEng._id], // explicit allow
    });

    const results = await Department.find({}).setOptions({ memberId });
    const names = results.map((d) => d.departmentName).sort();
    // dEng from explicit list + dHR from authorized user lookup; ops excluded.
    expect(names).toEqual(["eng", "hr"]);
  });

  it("respects an existing query filter alongside the access merge", async () => {
    const memberId = new mongoose.Types.ObjectId();
    const dA = await Department.create({ adminId, departmentName: "alpha" });
    const dB = await Department.create({ adminId, departmentName: "beta" });
    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: [],
      employeeLocations: [],
      departmentIds: [dA._id, dB._id],
    });

    // Caller-provided filter limits to "alpha"; hook ANDs in allowed ids.
    const results = await Department.find({ departmentName: "alpha" }).setOptions({
      memberId,
    });
    expect(results.map((d) => d.departmentName)).toEqual(["alpha"]);
  });

  it("unions locations + employeeLocations to derive allowed users", async () => {
    const memberId = new mongoose.Types.ObjectId();
    const dHR = await Department.create({ adminId, departmentName: "hr" });
    const dOps = await Department.create({ adminId, departmentName: "ops" });

    await AuthorizedUsers.create({
      adminId,
      firstName: "U",
      lastName: "1",
      email: "u1@t.test",
      location: "Mumbai",
      departmentId: dHR._id,
    });
    await AuthorizedUsers.create({
      adminId,
      firstName: "U",
      lastName: "2",
      email: "u2@t.test",
      location: "Bangalore",
      departmentId: dOps._id,
    });

    await AuthorizedChannels.create({
      adminId,
      userId: memberId,
      locations: ["Mumbai"],
      employeeLocations: ["Bangalore"],
      departmentIds: [],
    });

    const results = await Department.find({}).setOptions({ memberId });
    const names = results.map((d) => d.departmentName).sort();
    expect(names).toEqual(["hr", "ops"]);
  });
});
