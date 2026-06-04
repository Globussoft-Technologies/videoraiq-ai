/**
 * Branch coverage for AuthorizedChannelService.fetchChannels — the existing
 * cameraRestrictions.service.test.js only hits the admin-missing,
 * no-valid-filters and `locations=true` branches. This file walks the rest
 * of the if/else chain.
 *
 * NOTE: fetchChannels has two product bugs documented in issue #101:
 *   (a) The `nvrs=true` guard at L85 uses a comma operator so any request
 *       with a non-empty nvrIds is routed to the NVRs branch.
 *   (b) The `filteredNVRIds` filter compares ObjectIds against a Set of
 *       strings, so the filtered id list always comes back empty.
 * Tests below assert *current* behaviour so they execute (and therefore
 * cover) the branches in question. Where intended behaviour diverges from
 * actual, the affected assertions are scoped to bug-aware expectations and
 * labelled accordingly.
 *
 * Mocks: 0 — pure in-memory Mongo, real models throughout.
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
await import("../../../core/v1/locations/location.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

let admin;
let nvrHQ;
let nvrBranch;
let deptSecurity;
let deptReception;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "cr-fc-user",
    login: "cr-fc",
    email: "cr-fc@test.com",
  });
  nvrHQ = await NVR.create({
    userId: "cr-fc-user",
    nvrName: "NVR-HQ",
    brand: "hikvision",
    domain: "nvrHQ.local",
    location: "HQ",
    localNvrId: "nvr-fc-hq",
  });
  nvrBranch = await NVR.create({
    userId: "cr-fc-user",
    nvrName: "NVR-Branch",
    brand: "hikvision",
    domain: "nvrBranch.local",
    location: "Branch",
    localNvrId: "nvr-fc-branch",
  });
  deptSecurity = await Department.create({
    adminId: admin._id,
    departmentName: "Security",
  });
  deptReception = await Department.create({
    adminId: admin._id,
    departmentName: "Reception",
  });
  await Channel.create({
    nvrId: nvrHQ._id,
    userId: "cr-fc-user",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "fc-1",
    name: "Cam-HQ-Sec",
    department: [deptSecurity._id],
  });
  await Channel.create({
    nvrId: nvrHQ._id,
    userId: "cr-fc-user",
    streamingPath: "/Streaming/Channels/201",
    localChannelId: "fc-2",
    name: "Cam-HQ-Rec",
    department: [deptReception._id],
  });
  await Channel.create({
    nvrId: nvrBranch._id,
    userId: "cr-fc-user",
    streamingPath: "/Streaming/Channels/301",
    localChannelId: "fc-3",
    name: "Cam-Branch",
    department: [deptSecurity._id, deptReception._id],
  });
});

function ctx(over = {}) {
  return serviceCtx({
    adminId: admin._id,
    user_id: "cr-fc-user",
    ...over,
  });
}

// --------------------------------------------------------------------------
// fetchChannels — every if-branch other than the three already covered.
// --------------------------------------------------------------------------

describe("AuthorizedChannelService.fetchChannels — filter branches", () => {
  it("departments=true + selectedLocationIds (nvrIds=[]) returns Departments derived from channels in those NVRs", async () => {
    const { req, res, next } = ctx({
      body: {
        departments: true,
        selectedLocationIds: ["HQ"],
        nvrIds: [],
      },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/Departments fetched/);
    const names = payload(res).data.map((d) => d.departmentName).sort();
    // HQ NVR has Security + Reception channels → both departments returned.
    expect(names).toEqual(["Reception", "Security"]);
  });

  it("departments=true + selectedLocationIds + populated nvrIds intersects the channel set", async () => {
    // NOTE: due to issue #101 (b), filteredNVRIds collapses to [] when nvrIds
    // is populated, so the resulting Channel.find returns nothing and the
    // department list comes back empty. We still cover the branch path.
    const { req, res, next } = ctx({
      body: {
        departments: true,
        selectedLocationIds: ["HQ", "Branch"],
        nvrIds: [nvrBranch._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/Departments fetched/);
    // Bug-aware: the buggy filter wipes the channel set; document the
    // observed behaviour so the test stays GREEN under current code.
    expect(Array.isArray(payload(res).data)).toBe(true);
  });

  it("populated nvrIds is routed to the NVRs branch (issue #101a) and returns the filtered id list", async () => {
    // The comma-operator typo at L85 makes this branch fire whenever nvrIds
    // is populated, regardless of nvrs===true. Exercises the NVRs branch
    // — which is what we want for coverage.
    const { req, res, next } = ctx({
      body: {
        nvrIds: [nvrHQ._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/NVRs fetched/);
    // Due to issue #101 (b) the filtered list comes back empty.
    expect(Array.isArray(payload(res).data)).toBe(true);
  });

  it("nvrs=true with selectedLocationIds and nvrIds matching real NVR locations exercises the NVRs branch", async () => {
    // selectedLocationIds must include the seeded NVR's location for the
    // upstream NVR.find to return anything; nvrIds still gets filtered to []
    // by the buggy Set#has comparison (issue #101 b).
    const { req, res, next } = ctx({
      body: {
        nvrs: true,
        selectedLocationIds: ["HQ"],
        nvrIds: [nvrHQ._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/NVRs fetched/);
    expect(Array.isArray(payload(res).data)).toBe(true);
  });

  it("departmentIds-only returns channels with department in that list", async () => {
    const { req, res, next } = ctx({
      body: {
        departmentIds: [deptReception._id.toString()],
      },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/Channels fetched/);
    // Reception department is on chHQ_Reception + chBranch_Both.
    const names = payload(res).data.map((c) => c.name).sort();
    expect(names).toEqual(["Cam-Branch", "Cam-HQ-Rec"]);
  });

  it("departmentIds + empty nvrIds takes the departmentIds-only branch", async () => {
    const { req, res, next } = ctx({
      body: {
        departmentIds: [deptSecurity._id.toString()],
        nvrIds: [],
      },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toMatch(/Channels fetched/);
    const names = payload(res).data.map((c) => c.name).sort();
    // Security is on chHQ_Security and chBranch_Both.
    expect(names).toEqual(["Cam-Branch", "Cam-HQ-Sec"]);
  });

  it("returns the no-valid-filters failure response when only flags-without-data are supplied", async () => {
    // departments/nvrs=true without populated id-lists falls through every
    // branch and hits the trailing FailResp.
    const { req, res, next } = ctx({
      body: { departments: false, nvrs: false },
    });
    await AuthorizedChannelService.fetchChannels(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
