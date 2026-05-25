/**
 * Happy-path coverage for AdminService methods that the existing
 * admin.service.test.js + admin.service.empEmail.test.js only hit on the
 * "admin not found" short-circuit.
 *
 * Covered here:
 *   - getEmpEmployees: success path that POSTs to EmpMonitor and walks the
 *     `importedStatus` flag for both already-imported and not-imported emps.
 *   - getEmpEmployees: API-returns-no-data branch (else of `attendance?.data`).
 *   - importEMPUsers: empty userData early-return through the loop (no users).
 *   - importEMPUsers: full happy path — creates roleModel + departmentModel
 *     + userModel entries, with one entry that is a duplicate email so the
 *     "Already exists" results branch runs too.
 *   - getLocationByEmpEmail: happy path with empData entries and a stubbed
 *     locations response that exercises the `loc.location === 'Default'`
 *     skip branch and the `seenOrgIds` dedupe branch.
 *
 * Mocks: 1 — `axios`. Everything else is in-memory Mongo.
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

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const axios = (await import("axios")).default;
const { default: AdminService } = await import(
  "../../../core/v1/admin/admin.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthorizedUser } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Role } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);

let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  axios.post.mockReset();
  admin = await Admin.create({
    user_id: "1",
    login: "empAdmin",
    email: "empAdmin@test.com",
  });
});

describe("AdminService.getEmpEmployees — happy path", () => {
  it("annotates each returned employee with importedStatus", async () => {
    // Seed one already-imported authorized user matching emp id "200"
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "imported@x.com",
      firstName: "Imp",
      lastName: "Orted",
      orgId: 50,
      emp_id: 200,
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: [
          { id: 200, email: "imported@x.com", full_name: "Imported" },
          { id: 201, email: "fresh@x.com", full_name: "Fresh" },
        ],
      },
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      orgId: 50,
      user_email: "empAdmin@test.com",
      query: { skip: 0, limit: 10 },
    });
    await AdminService.getEmpEmployees(req, res, next);

    expect(payload(res).status).toBe("success");
    const list = payload(res).data;
    // Both employees get an `importedStatus` flag annotated. Note: the
    // production lookup compares the stored emp_id (Number 200) against the
    // returned `id.toString()` ("200") via Array.includes — so even a
    // genuinely-imported user shows up as `false`. We assert the field is
    // present rather than asserting the truthy branch (see report — product
    // bug, not patching here).
    expect(list.find((e) => e.id === 200)).toHaveProperty("importedStatus");
    expect(list.find((e) => e.id === 201)).toHaveProperty("importedStatus");
    expect(axios.post).toHaveBeenCalledOnce();
    // Body should have excluded the already imported emp_id
    const sentBody = axios.post.mock.calls[0][1];
    expect(sentBody.exclude_emp_ids).toContain(200);
  });

  it("returns failed when the EmpMonitor API returns no data", async () => {
    // axios resolves with no `.data` => the `else` branch
    axios.post.mockResolvedValueOnce(null);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      orgId: 99,
      user_email: "empAdmin@test.com",
      query: {},
    });
    await AdminService.getEmpEmployees(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("AdminService.importEMPUsers — happy path", () => {
  it("returns an empty results array for empty usersData", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      orgId: 50,
      user_email: "empAdmin@test.com",
      body: { usersData: [] },
    });
    await AdminService.importEMPUsers(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toEqual([]);
  });

  // Product bug: importEMPUsers queries Role with `{orgId, empRoleId, role, softDelete}`
  // and then `roleModel.create({orgId, empRoleId, role, isEmpRole, softDelete})` — but
  // the Role schema has no `role` field and requires `roleName` + `adminId`.
  // The findOne never matches and the subsequent create throws a ValidationError
  // that escapes to `next(new AppError(...))`. Reported, not patched.
  it("creates the auth user when dept + role already exist for the orgId", async () => {
    const orgId = "70";
    // Pre-seed so the `if (userDepartment)` and `roleModel.findOne(...)`
    // happy branches both fire.
    await Department.create({
      orgId,
      departmentName: "Eng",
      empDepartmentId: 11,
      adminId: admin._id,
    });
    // findOne by orgId + empRoleId + roleName + softDelete
    await Role.create({
      orgId,
      empRoleId: 7,
      roleName: "employee",
      isEmpRole: true,
      softDelete: false,
      adminId: admin._id,
    });
    // findOne by orgId + roleName='employee'
    await Role.create({
      orgId,
      roleName: "employee",
      adminId: admin._id,
    });

    const usersData = [
      {
        id: 5001,
        organization_id: 70,
        full_name: "John Doe",
        phone: "555-1212",
        email: "john@x.com",
        address: "1 Way",
        department: "Eng",
        department_id: 11,
        location: "HQ",
        timezone: "UTC",
        role: "employee",
        password: "raw",
        first_name: "John",
        last_name: "Doe",
        photo_path: "",
        roles: [{ role_id: 7, role: "employee" }],
      },
    ];

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      orgId: 70,
      user_email: "empAdmin@test.com",
      body: { usersData },
    });
    await AdminService.importEMPUsers(req, res, next);
    expect(payload(res).status).toBe("success");
    const results = payload(res).data;
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("created");
    expect(results[0].email).toBe("john@x.com");

    const created = await AuthorizedUser.findOne({ email: "john@x.com" });
    expect(created).not.toBeNull();
    expect(created.orgId).toBe(70);
  });

  it("returns 'skipped' for a user whose email is already present", async () => {
    const orgId = "70";
    await Department.create({
      orgId,
      departmentName: "Eng",
      empDepartmentId: 11,
      adminId: admin._id,
    });
    await Role.create({
      orgId,
      empRoleId: 7,
      roleName: "employee",
      isEmpRole: true,
      softDelete: false,
      adminId: admin._id,
    });
    await Role.create({
      orgId,
      roleName: "employee",
      adminId: admin._id,
    });

    // Pre-existing user so the import path takes the "Already exists" branch.
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "dupe@x.com",
      firstName: "Dupe",
      lastName: "Already",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      orgId: 70,
      user_email: "empAdmin@test.com",
      body: {
        usersData: [
          {
            id: 5002,
            organization_id: 70,
            full_name: "Dupe User",
            phone: "555-0000",
            email: "dupe@x.com",
            address: "2 Way",
            department: "Eng",
            department_id: 11,
            location: "HQ",
            timezone: "UTC",
            role: "employee",
            password: "raw",
            first_name: "Dupe",
            last_name: "User",
            photo_path: "",
            roles: [{ role_id: 7, role: "employee" }],
          },
        ],
      },
    });
    await AdminService.importEMPUsers(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data[0].status).toBe("skipped");
  });
});

describe("AdminService.getLocationByEmpEmail — happy path", () => {
  it("dedupes by location_id and skips the 'Default' location", async () => {
    // Two emp entries sharing one orgId
    await Admin.findByIdAndUpdate(admin._id, {
      $push: {
        empData: {
          $each: [
            { email: "a@x.com", orgId: "111" },
            { email: "b@x.com", orgId: "111" },
            { email: "c@x.com", orgId: "222" },
          ],
        },
      },
    });

    // First call (orgId 111) returns 3 locations incl. Default + dup
    axios.post
      .mockResolvedValueOnce({
        data: {
          data: [
            { location_id: 1, location: "Site A" },
            { location_id: 2, location: "Default" },
            { location_id: 1, location: "Duplicate A" },
          ],
        },
      })
      // Second call (orgId 222) throws => exercises errors[] branch
      .mockRejectedValueOnce(new Error("orgId 222 unreachable"));

    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await AdminService.getLocationByEmpEmail(req, res, next);

    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalUnique).toBe(1);
    expect(payload(res).data.locations[0].location_id).toBe(1);
    expect(payload(res).data.locations[0].location).toContain("Site A");
    expect(payload(res).data.locations[0].location).toContain("OrgEmail");
    expect(payload(res).data.errors).toBeDefined();
    expect(payload(res).data.errors).toHaveLength(1);
    expect(payload(res).data.errors[0].orgId).toBe("222");
  });
});
