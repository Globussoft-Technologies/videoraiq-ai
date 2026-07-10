/**
 * UsersService.importUsers — happy-path `runImport` body (lines 1243-1377).
 *
 * The base `users.service.import.test.js` covered ONLY the input-validation
 * short-circuits and the "Role 'read' not found" early-return. The entire
 * fire-and-forget `runImport` body (per-user retryOperation calls on
 * departmentsModel.findOneAndUpdate + create, the authorizedUsers.updateOne
 * upsert, the import/skip branch, the catch-and-record branch, and the
 * final `Completed with Errors` vs `Completed` status pick) was 0%.
 *
 * This file pins:
 *   - upserted users land in DB and bump `imported`
 *   - already-existing users (matched by {adminId,email}) bump `skipped`
 *   - users missing required fields cause the catch branch to bump
 *     `skipped` with a `failedUsers[].reason` entry → status becomes
 *     "Completed with Errors"
 *   - department lookup uses the existing department when one exists
 *     (no new doc created), and creates it when missing
 *   - retryOperation indirectly exercised on the success-first-try path
 *
 * No axios calls are issued by this code path (autoSyncLocations is
 * mocked to no-op so it doesn't touch unrelated collections during the
 * background sync). Mocks: 2 — axios, helperFunctions.autoSyncLocations.
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
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } }));
vi.mock("../../../utils/helperFunctions.js", async () => {
  const actual = await vi.importActual("../../../utils/helperFunctions.js");
  return {
    ...actual,
    autoSyncLocations: vi.fn().mockResolvedValue(undefined),
  };
});

const usersServiceModule = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: UsersService, importJobs } = usersServiceModule;
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Role } = await import(
  "../../../core/v1/roles/roles.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
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
  vi.clearAllMocks();
  admin = await Admin.create({
    user_id: "1",
    login: "imp",
    email: "imp-runimport@test.com",
  });
  // Seed the required 'read' role so importUsers doesn't short-circuit.
  await Role.create({ adminId: admin._id, roleName: "read" });
  importJobs.clear();
});

/** Poll the importJobs map until the background `runImport` finishes. */
async function waitForJobToFinish(adminId, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = importJobs.get(String(adminId));
    if (job && /^Completed/.test(job.status)) return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Background runImport did not complete within timeout");
}

describe("UsersService.importUsers — runImport happy path", () => {
  it("returns 200 immediately and upserts a brand-new user in the background", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        usersData: [
          {
            id: 9001,
            full_name: "Imp One",
            first_name: "Imp",
            last_name: "One",
            email: "imp.one@test.com",
            phone: "555-1212",
            department: "Engineering",
            department_id: 11,
            location: "HQ",
            location_id: 22,
            organization_id: 5,
            timezone: "UTC",
            role: "engineer",
            role_id: 33,
            address: "1 Way",
            password: "pw",
          },
        ],
      },
    });

    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");

    const job = await waitForJobToFinish(admin._id);
    expect(job.imported).toBe(1);
    expect(job.skipped).toBe(0);
    expect(job.status).toBe("Completed");
    expect(job.percentage).toBe(100);

    // The user landed in the DB with normalized fields.
    const stored = await AuthorizedUsers.findOne({ email: "imp.one@test.com" });
    expect(stored).toBeTruthy();
    expect(stored.firstName).toBe("Imp");
    // location is lowercased in the import body
    expect(stored.location).toBe("hq");
    // emp_id stored as a stringified number
    expect(String(stored.emp_id)).toBe("9001");
    // phone hyphen stripped per `phone.replace("-", "")`
    expect(stored.phoneNumber).toBe("5551212");

    // Department was created (none existed beforehand) with lowercased name.
    const dept = await Department.findOne({ adminId: admin._id });
    expect(dept).toBeTruthy();
    expect(dept.departmentName).toBe("engineering");
    expect(dept.isImportedFromEMP).toBe(true);
    expect(dept.empDepartmentId).toBe(11);
  });

  it("reuses an existing department (findOneAndUpdate hit) instead of creating one", async () => {
    // Pre-seed a department with a case-mismatched name to exercise the
    // case-insensitive regex match inside retryOperation.
    await Department.create({
      adminId: admin._id,
      departmentName: "Sales",
      empDepartmentId: 7,
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        usersData: [
          {
            id: 5050,
            full_name: "Sal Person",
            first_name: "Sal",
            last_name: "Person",
            email: "sal.person@test.com",
            department: "sales", // matches case-insensitively
            department_id: 7,
            organization_id: 5,
          },
        ],
      },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(200);

    const job = await waitForJobToFinish(admin._id);
    expect(job.imported).toBe(1);
    expect(job.status).toBe("Completed");

    // Still exactly one department for this admin — no duplicate created.
    const depts = await Department.find({ adminId: admin._id });
    expect(depts).toHaveLength(1);
    // departmentName lowercased by the update body (deptToStore).
    expect(depts[0].departmentName).toBe("sales");
  });

  it("skips a user whose {adminId,email} key already exists (upsertedCount=0)", async () => {
    // Pre-existing authorized user with same {adminId, email}.
    await AuthorizedUsers.create({
      adminId: admin._id,
      email: "dup@test.com",
      firstName: "Already",
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        usersData: [
          {
            id: 1,
            email: "dup@test.com",
            first_name: "Dup",
            department: "Ops",
            organization_id: 5,
          },
        ],
      },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(200);

    const job = await waitForJobToFinish(admin._id);
    expect(job.imported).toBe(0);
    expect(job.skipped).toBe(1);
    expect(job.failedUsers).toHaveLength(1);
    expect(job.failedUsers[0].email).toBe("dup@test.com");
    expect(job.failedUsers[0].reason).toMatch(/already exists/i);
    // No new email-clashing user — original first name preserved.
    const all = await AuthorizedUsers.find({ email: "dup@test.com" });
    expect(all).toHaveLength(1);
    expect(all[0].firstName).toBe("Already");
  });

  it("counts both imported and skipped across a mixed batch and reports 100% progress", async () => {
    await AuthorizedUsers.create({
      adminId: admin._id,
      email: "existing@test.com",
      firstName: "Was",
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        usersData: [
          {
            id: 1,
            email: "new1@test.com",
            first_name: "New1",
            department: "DeptA",
            organization_id: 5,
          },
          {
            id: 2,
            email: "existing@test.com", // dup → skipped
            first_name: "Skip",
            department: "DeptA",
            organization_id: 5,
          },
          {
            id: 3,
            email: "new2@test.com",
            first_name: "New2",
            department: "DeptB",
            organization_id: 5,
          },
        ],
      },
    });
    await UsersService.importUsers(req, res);
    const job = await waitForJobToFinish(admin._id);
    expect(job.processedUsers).toBe(3);
    expect(job.imported).toBe(2);
    expect(job.skipped).toBe(1);
    expect(job.percentage).toBe(100);
    // Mixed outcome → "Completed with Errors" since failedUsers is non-empty.
    expect(job.status).toBe("Completed with Errors");
  });
});
