/**
 * Branch coverage for AuthorizedChannelService — exercise each filter
 * permutation in `fetchLocations`, `fetchDepartments`, `fetchNVRS`, and
 * `fetchChannelByNVRsOrDepartment`. The original test only hits the
 * no-filter / admin-missing branches.
 *
 * The service delegates to internal helpers (`fetchLocationsByNVRs`,
 * `fetchDepartmentsByLocation`, `fetchNVRsByChannels`, etc.) that are not
 * exported but get traversed via the filter combinations below.
 *
 * Mocks: 0 — pure in-memory Mongo.
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

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "cr-user",
    login: "cr",
    email: "cr@test.com",
  });
  nvrA = await NVR.create({
    userId: "cr-user",
    nvrName: "NVR-HQ",
    brand: "hikvision",
    domain: "nvrA.local",
    location: "HQ",
    localNvrId: "nvr-a",
  });
  nvrB = await NVR.create({
    userId: "cr-user",
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
  // Channels with the necessary refs for department / NVR fan-out.
  chA = await Channel.create({
    nvrId: nvrA._id,
    userId: "cr-user",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-A",
    department: [deptA._id],
  });
  chB = await Channel.create({
    nvrId: nvrA._id,
    userId: "cr-user",
    streamingPath: "/Streaming/Channels/201",
    localChannelId: "2",
    name: "Cam-B",
    department: [deptB._id],
  });
  chC = await Channel.create({
    nvrId: nvrB._id,
    userId: "cr-user",
    streamingPath: "/Streaming/Channels/301",
    localChannelId: "3",
    name: "Cam-C",
    department: [deptA._id, deptB._id],
  });
});

function ctx(over = {}) {
  return serviceCtx({
    adminId: admin._id,
    user_id: "cr-user",
    ...over,
  });
}

// --------------------------------------------------------------------------
// fetchLocations — every filter permutation routes through a helper.
// --------------------------------------------------------------------------

describe("AuthorizedChannelService.fetchLocations — filter branches", () => {
  it("nvrIds-only → uses fetchLocationsByNVRs", async () => {
    const { req, res, next } = ctx({ body: { nvrIds: [nvrA._id.toString()] } });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toContain("HQ");
  });

  it("departmentIds-only → uses fetchLocationsByDepartment", async () => {
    const { req, res, next } = ctx({
      body: { departmentIds: [deptA._id.toString()] },
    });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("success");
    // deptA links chA(nvrA→HQ) + chC(nvrB→Branch)
    expect(payload(res).data).toEqual(
      expect.arrayContaining(["HQ", "Branch"]),
    );
  });

  it("channelsIds-only → uses fetchLocationsByChannels", async () => {
    const { req, res, next } = ctx({
      body: { channelsIds: [chC._id.toString()] },
    });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toContain("Branch");
  });

  it("nvrIds + channelsIds → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrB._id.toString()],
        channelsIds: [chC._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toContain("Branch");
  });

  it("nvrIds + departmentIds → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString()],
        departmentIds: [deptA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchLocations(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

// --------------------------------------------------------------------------
// fetchDepartments — filter permutations.
// --------------------------------------------------------------------------

describe("AuthorizedChannelService.fetchDepartments — filter branches", () => {
  it("selectedLocations-only → fetchDepartmentsByLocation", async () => {
    const { req, res, next } = ctx({
      body: { selectedLocations: ["HQ"] },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(Array.isArray(payload(res).data)).toBe(true);
  });

  it("nvrIds-only → fetchDepartmentsByNVRs", async () => {
    const { req, res, next } = ctx({
      body: { nvrIds: [nvrA._id.toString()] },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(Array.isArray(payload(res).data)).toBe(true);
  });

  it("channelsIds-only → fetchDepartmentsByChannels", async () => {
    const { req, res, next } = ctx({
      body: { channelsIds: [chC._id.toString()] },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(Array.isArray(payload(res).data)).toBe(true);
  });

  it("nvrIds + selectedLocations → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString()],
        selectedLocations: ["HQ"],
      },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("selectedLocations + channelsIds → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        selectedLocations: ["HQ"],
        channelsIds: [chA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("nvrIds + channelsIds → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString()],
        channelsIds: [chA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("nvrIds + selectedLocations + channelsIds → triple intersection", async () => {
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrA._id.toString()],
        selectedLocations: ["HQ"],
        channelsIds: [chA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchDepartments(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

// --------------------------------------------------------------------------
// fetchNVRS — filter permutations.
// --------------------------------------------------------------------------

describe("AuthorizedChannelService.fetchNVRS — filter branches", () => {
  it("selectedLocations-only → fetchNVRsByLocation", async () => {
    const { req, res, next } = ctx({
      body: { selectedLocations: ["HQ"] },
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("departmentIds-only → branch", async () => {
    const { req, res, next } = ctx({
      body: { departmentIds: [deptA._id.toString()] },
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("channelsIds-only → branch", async () => {
    const { req, res, next } = ctx({
      body: { channelsIds: [chA._id.toString()] },
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("departmentIds + channelsIds → fetchNVRsByChannels ∩ fetchNVRsByDepartmentIds", async () => {
    const { req, res, next } = ctx({
      body: {
        departmentIds: [deptA._id.toString()],
        channelsIds: [chA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("selectedLocations + departmentIds → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        selectedLocations: ["HQ"],
        departmentIds: [deptA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("selectedLocations + channelsIds → intersection branch", async () => {
    const { req, res, next } = ctx({
      body: {
        selectedLocations: ["HQ"],
        channelsIds: [chA._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchNVRS(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

// --------------------------------------------------------------------------
// fetchChannelByNVRsOrDepartment — filter permutations.
// --------------------------------------------------------------------------

describe("AuthorizedChannelService.fetchChannelByNVRsOrDepartment — filter branches", () => {
  it("selectedLocations-only without grouping", async () => {
    const { req, res, next } = ctx({
      body: { selectedLocations: ["HQ"] },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
  });

  it("selectedLocations-only with isUserRegFilter=true (grouped-by-NVR shape)", async () => {
    const { req, res, next } = ctx({
      body: { selectedLocations: ["HQ"], isUserRegFilter: true },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    expect(Array.isArray(data)).toBe(true);
    // Each entry should have an `nvrId` + `channels` shape.
    expect(data[0]).toHaveProperty("nvrId");
    expect(data[0]).toHaveProperty("channels");
  });

  it("nvrIds-only branch", async () => {
    const { req, res, next } = ctx({
      body: { nvrIds: [nvrA._id.toString()] },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
  });

  it("departmentIds-only branch", async () => {
    const { req, res, next } = ctx({
      body: { departmentIds: [deptA._id.toString()] },
    });
    await AuthorizedChannelService.fetchChannelByNVRsOrDepartment(
      req,
      res,
      next,
    );
    expect(payload(res).status).toBe("success");
  });
});
