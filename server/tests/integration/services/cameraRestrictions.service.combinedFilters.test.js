/**
 * Combined-filter coverage for AuthorizedChannelService.fetchChannelByNVRsOrDepartment.
 *
 * The existing branches test (`cameraRestrictions.service.branches.test.js`)
 * covers the single-filter arms (selectedLocations-only, nvrIds-only,
 * departmentIds-only). The combined arms (two or three filters at once) and
 * the internal helpers `fetchChannelsByNVRIdsAndLocation` +
 * `fetchChannelsByDepartmentIdsAndLocation` are still uncovered — coverage
 * report flags lines 1188 + 1200-1254 in the service. This file exercises:
 *
 *  • nvrIds + selectedLocations         → intersection with location-derived set
 *  • departmentIds + selectedLocations  → intersection with location-derived set
 *  • departmentIds + nvrIds             → walks both helper functions
 *  • nvrIds + departmentIds + selectedLocations → triple intersection
 *  • no-filters fallback                → returns all channels for userId
 *  • no-filters fallback + isUserRegFilter=true → grouped-by-NVR shape
 *
 * Each test also exercises the `searchQuery` + `camType` arms inside at least
 * one branch (regex filter + checkType $in) so the helper functions' inner
 * conditionals are walked too.
 *
 * Mocks: 0 — pure in-memory Mongo (uses mongodb-memory-server via dbSetup).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: AuthorizedChannelService } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
// Models referenced by the service module's imports — register on the
// in-memory Mongo so the find() helpers don't trip MissingSchemaError.
await import("../../../core/v1/locations/location.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

let admin;
let nvrA;
let nvrB;
let deptA;
let deptB;
let chA;
let chB;
let chC;
let chD;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "cf-user",
    login: "cf",
    email: "cf@test.com",
  });
  nvrA = await NVR.create({
    userId: "cf-user",
    nvrName: "NVR-HQ",
    brand: "hikvision",
    domain: "nvrA.local",
    location: "HQ",
    localNvrId: "nvr-a",
  });
  nvrB = await NVR.create({
    userId: "cf-user",
    nvrName: "NVR-Branch",
    brand: "hikvision",
    domain: "nvrB.local",
    location: "Branch",
    localNvrId: "nvr-b",
  });
  deptA = await Department.create({
    adminId: admin._id,
    departmentName: "Security",
  });
  deptB = await Department.create({
    adminId: admin._id,
    departmentName: "Reception",
  });
  // Channel layout:
  //   chA  nvrA HQ      deptA
  //   chB  nvrA HQ      deptB
  //   chC  nvrB Branch  deptA + deptB
  //   chD  nvrB Branch  deptB (checkType: "checkin")
  chA = await Channel.create({
    nvrId: nvrA._id,
    userId: "cf-user",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-A",
    customName: "Lobby",
    department: [deptA._id],
    isAdded: true,
  });
  chB = await Channel.create({
    nvrId: nvrA._id,
    userId: "cf-user",
    streamingPath: "/Streaming/Channels/201",
    localChannelId: "2",
    name: "Cam-B",
    customName: "Reception",
    department: [deptB._id],
    isAdded: true,
  });
  chC = await Channel.create({
    nvrId: nvrB._id,
    userId: "cf-user",
    streamingPath: "/Streaming/Channels/301",
    localChannelId: "3",
    name: "Cam-C",
    customName: "Gate",
    department: [deptA._id, deptB._id],
    isAdded: true,
  });
  chD = await Channel.create({
    nvrId: nvrB._id,
    userId: "cf-user",
    streamingPath: "/Streaming/Channels/401",
    localChannelId: "4",
    name: "Cam-D",
    customName: "Backdoor",
    department: [deptB._id],
    checkType: "checkin",
    isAdded: true,
  });
});

function ctx(over = {}) {
  return serviceCtx({
    adminId: admin._id,
    user_id: "cf-user",
    ...over,
  });
}

// --------------------------------------------------------------------------
// nvrIds + selectedLocations (lines 693-742)
// --------------------------------------------------------------------------

describe("fetchChannelByNVRsOrDepartment — nvrIds + selectedLocations", () => {
  it("intersects channels in nvrA with channels in the HQ location set", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString()],
        selectedLocations: ["HQ"],
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    expect(Array.isArray(data)).toBe(true);
    // Both chA + chB are in nvrA AND in HQ-derived NVRs. chC/chD are not (they
    // live in nvrB / Branch).
    const ids = data.map((d) => d._id.toString()).sort();
    expect(ids).toEqual([chA._id.toString(), chB._id.toString()].sort());
  });

  it("emits the grouped-by-NVR shape when isUserRegFilter=true", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString()],
        selectedLocations: ["HQ"],
        isUserRegFilter: true,
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    expect(Array.isArray(data)).toBe(true);
    // Grouped shape: one entry per NVR. Only nvrA was passed.
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      nvrId: nvrA._id,
      nvrName: "NVR-HQ",
      brand: "hikvision",
    });
    expect(data[0].channels.map((c) => c._id.toString()).sort()).toEqual(
      [chA._id.toString(), chB._id.toString()].sort(),
    );
  });

  it("applies searchQuery + camType inside the nvrIds branch", async () => {
    const { req, res, next } = ctx({
      query: { searchQuery: "Lobby" },
      body: {
        nvrIds: [nvrA._id.toString()],
        selectedLocations: ["HQ"],
        camType: ["checkout"],
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    // chA's checkType defaults to "none", so camType:["checkout"] excludes everything
    // → returns an empty intersection. This walks the camType + searchQuery
    // arms inside the nvrIds-only-with-locations branch.
    expect(payload(res).data).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// departmentIds + selectedLocations (lines 744-787)
// --------------------------------------------------------------------------

describe("fetchChannelByNVRsOrDepartment — departmentIds + selectedLocations", () => {
  it("intersects channels in deptA with channels in the HQ location set", async () => {
    const { req, res, next } = ctx({
      body: {
        departmentIds: [deptA._id.toString()],
        selectedLocations: ["HQ"],
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    // Only chA is both deptA AND HQ. chC is deptA but Branch.
    const ids = payload(res).data.map((d) => d._id.toString());
    expect(ids).toEqual([chA._id.toString()]);
  });

  it("grouped-by-NVR shape with isUserRegFilter=true", async () => {
    const { req, res, next } = ctx({
      body: {
        departmentIds: [deptB._id.toString()],
        selectedLocations: ["HQ"],
        isUserRegFilter: true,
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    // allNVRList covers BOTH nvrs (no nvrIds filter applied to it). chB sits
    // under nvrA; chC is in deptB but Branch → excluded.
    expect(Array.isArray(data)).toBe(true);
    // Find the nvrA group and confirm it contains chB only.
    const nvrAGroup = data.find(
      (g) => g.nvrId.toString() === nvrA._id.toString(),
    );
    expect(nvrAGroup).toBeDefined();
    expect(nvrAGroup.channels.map((c) => c._id.toString())).toEqual([
      chB._id.toString(),
    ]);
  });
});

// --------------------------------------------------------------------------
// departmentIds + nvrIds (lines 789-816) — exercises the helper functions
// fetchChannelsByNVRIdsAndLocation + fetchChannelsByDepartmentIdsAndLocation
// (the lines highlighted in the coverage report as 1200-1254).
// --------------------------------------------------------------------------

describe("fetchChannelByNVRsOrDepartment — departmentIds + nvrIds", () => {
  it("intersects NVR-derived channels with department-derived channels (helpers walked)", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrB._id.toString()],
        departmentIds: [deptA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    // chC is in nvrB AND deptA — the intersection.
    const ids = payload(res).data.map((d) => d._id.toString());
    expect(ids).toEqual([chC._id.toString()]);
  });

  it("returns the grouped shape when isUserRegFilter=true (departmentIds + nvrIds)", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString(), nvrB._id.toString()],
        departmentIds: [deptA._id.toString()],
        isUserRegFilter: true,
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    expect(Array.isArray(data)).toBe(true);
    // Two NVRs were requested → grouped output has both. chA in nvrA group,
    // chC in nvrB group (both in deptA).
    expect(data).toHaveLength(2);
    const nvrAGroup = data.find(
      (g) => g.nvrId.toString() === nvrA._id.toString(),
    );
    const nvrBGroup = data.find(
      (g) => g.nvrId.toString() === nvrB._id.toString(),
    );
    expect(nvrAGroup.channels.map((c) => c._id.toString())).toEqual([
      chA._id.toString(),
    ]);
    expect(nvrBGroup.channels.map((c) => c._id.toString())).toEqual([
      chC._id.toString(),
    ]);
  });

  it("applies searchQuery + camType inside the helper functions", async () => {
    // The helper functions' searchQuery + camType branches are normally only
    // reachable through this combined arm. Pass camType=["indoor"] to filter
    // both helpers' base queries; the only indoor camera is chD (nvrB/deptB).
    const { req, res, next } = ctx({
      query: { searchQuery: "Backdoor" },
      body: {
        nvrIds: [nvrB._id.toString()],
        departmentIds: [deptB._id.toString()],
        camType: ["checkin"],
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const ids = payload(res).data.map((d) => d._id.toString());
    expect(ids).toEqual([chD._id.toString()]);
  });
});

// --------------------------------------------------------------------------
// nvrIds + departmentIds + selectedLocations (lines 819-849)
// --------------------------------------------------------------------------

describe("fetchChannelByNVRsOrDepartment — nvrIds + departmentIds + selectedLocations", () => {
  it("triple-intersects NVR, department, and location sets", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString(), nvrB._id.toString()],
        departmentIds: [deptA._id.toString()],
        selectedLocations: ["HQ"],
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    // chA: nvrA ∈ nvrIds, deptA ∈ departments, HQ ∈ locations → INCLUDED
    // chC: nvrB ∈ nvrIds, deptA ∈ departments, Branch ∉ HQ → EXCLUDED
    const ids = payload(res).data.map((d) => d._id.toString());
    expect(ids).toEqual([chA._id.toString()]);
  });

  it("triple-intersection with isUserRegFilter=true returns the grouped shape", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString(), nvrB._id.toString()],
        departmentIds: [deptB._id.toString()],
        selectedLocations: ["HQ", "Branch"],
        isUserRegFilter: true,
      },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    // deptB channels across both NVRs and both locations: chB (nvrA/HQ),
    // chC (nvrB/Branch), chD (nvrB/Branch).
    expect(data).toHaveLength(2);
    const nvrAGroup = data.find(
      (g) => g.nvrId.toString() === nvrA._id.toString(),
    );
    const nvrBGroup = data.find(
      (g) => g.nvrId.toString() === nvrB._id.toString(),
    );
    expect(nvrAGroup.channels.map((c) => c._id.toString()).sort()).toEqual([
      chB._id.toString(),
    ]);
    expect(nvrBGroup.channels.map((c) => c._id.toString()).sort()).toEqual(
      [chC._id.toString(), chD._id.toString()].sort(),
    );
  });
});

// --------------------------------------------------------------------------
// No-filter fallback (lines 852-894) — neither nvrIds, nor departmentIds,
// nor selectedLocations supplied.
// --------------------------------------------------------------------------

describe("fetchChannelByNVRsOrDepartment — no-filter fallback", () => {
  it("returns every channel for the user when no filter is supplied", async () => {
    const { req, res, next } = ctx({
      body: {},
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const ids = payload(res).data.map((d) => d._id.toString()).sort();
    expect(ids).toEqual(
      [
        chA._id.toString(),
        chB._id.toString(),
        chC._id.toString(),
        chD._id.toString(),
      ].sort(),
    );
  });

  it("groups the no-filter result by NVR when isUserRegFilter=true", async () => {
    const { req, res, next } = ctx({
      body: { isUserRegFilter: true },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    expect(data).toHaveLength(2);
    const nvrAGroup = data.find(
      (g) => g.nvrId.toString() === nvrA._id.toString(),
    );
    const nvrBGroup = data.find(
      (g) => g.nvrId.toString() === nvrB._id.toString(),
    );
    expect(nvrAGroup.channels.map((c) => c._id.toString()).sort()).toEqual(
      [chA._id.toString(), chB._id.toString()].sort(),
    );
    expect(nvrBGroup.channels.map((c) => c._id.toString()).sort()).toEqual(
      [chC._id.toString(), chD._id.toString()].sort(),
    );
  });

  it("applies the no-filter camType filter (checkType:checkin) and searchQuery", async () => {
    const { req, res, next } = ctx({
      query: { searchQuery: "back" }, // regex case-insensitive against name/customName
      body: { camType: ["checkin"] },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const ids = payload(res).data.map((d) => d._id.toString());
    expect(ids).toEqual([chD._id.toString()]);
  });
});
