/**
 * UsersService.allOrgEmployee — happy + filter paths.
 *
 * The base users.service.import.test.js only exercises the admin-not-found
 * and no-empData short-circuits. This file fills in:
 *   - successful EmpMonitor lookup with empData and unique orgIds
 *   - `name` filter pass-through onto the axios body
 *   - `orgIdFilter` narrowing applied to finalOrgIds
 *   - `locationOrgIds` intersection branch (seeded auth users with `location`)
 *   - response.data missing → "Something went wrong" fallback
 *   - importedStatus annotation on returned empOrgDataArray
 *
 * Mocks: 1 — axios.
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

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import axios from "axios";

const { default: UsersService } = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthorizedUser } = await import(
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
    email: "imp@test.com",
    empData: [
      { email: "a@x.com", orgId: "111" },
      { email: "b@x.com", orgId: "222" },
    ],
  });
});

describe("UsersService.allOrgEmployee — happy path", () => {
  it("returns the fetched employee list and stamps importedStatus", async () => {
    // Seed one already-imported authorized user matching emp_id 9001
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "imported@x.com",
      firstName: "Imp",
      emp_id: 9001,
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [
            { id: 9001, email: "imported@x.com", full_name: "Imported" },
            { id: 9002, email: "fresh@x.com", full_name: "Fresh" },
          ],
          count: 2,
        },
      },
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 10 },
    });
    await UsersService.allOrgEmployee(req, res);

    expect(payload(res).status).toBe("success");
    const list = payload(res).data.empOrgDataArray;
    expect(list).toHaveLength(2);
    expect(payload(res).data.count).toBe(2);
    // emp_id 9001 stored as Number — production compares by `.includes(id)` with
    // both arrays as Numbers, so it should match.
    expect(list.find((e) => e.id === 9001).importedStatus).toBe(true);
    expect(list.find((e) => e.id === 9002).importedStatus).toBe(false);

    // Body posted to EmpMonitor includes both orgIds and the secretKey.
    const sentBody = axios.post.mock.calls[0][1];
    expect(sentBody.secretKey).toBe("test-emp-secret");
    expect(sentBody.organization_ids.sort()).toEqual([111, 222]);
  });

  it("forwards `name` onto the axios body", async () => {
    axios.post.mockResolvedValueOnce({
      data: { data: { users: [], count: 0 } },
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 5, name: "Jane" },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("success");
    const sentBody = axios.post.mock.calls[0][1];
    expect(sentBody.name).toBe("Jane");
  });

  it("filters to a single orgId when `orgId` is supplied in the body", async () => {
    axios.post.mockResolvedValueOnce({
      data: { data: { users: [], count: 0 } },
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 5, orgId: 222 },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("success");
    const sentBody = axios.post.mock.calls[0][1];
    expect(sentBody.organization_ids).toEqual([222]);
  });

  it("intersects orgIds with locationOrgIds when `location` is provided", async () => {
    // Seed two auth users with the same `location`; the orgIds collected from
    // them get intersected with empData orgIds.
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "loc1@x.com",
      orgId: 111,
      location: "HQ",
    });
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "loc2@x.com",
      orgId: 999, // not in empData → filtered out by the intersection
      location: "HQ",
    });

    axios.post.mockResolvedValueOnce({
      data: { data: { users: [], count: 0 } },
    });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 5, location: "HQ" },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("success");
    const sentBody = axios.post.mock.calls[0][1];
    expect(sentBody.organization_ids).toEqual([111]);
  });

  it("falls back to 'Something went wrong' when the API has no .data", async () => {
    axios.post.mockResolvedValueOnce(null);
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 5 },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("falls back to the generic catch when axios throws", async () => {
    axios.post.mockRejectedValueOnce(new Error("network blew up"));
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 5 },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/allOrgEmployee/);
  });
});
