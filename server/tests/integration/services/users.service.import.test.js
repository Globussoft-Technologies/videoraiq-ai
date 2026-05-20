/**
 * UsersService — `importUsers` validation paths, `allOrgEmployee` admin lookup,
 * and `checkEmpAdmin` happy path via mocked axios. Avoids the SFTP / face-auth
 * side of the service entirely.
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

// Mock axios so checkEmpAdmin / allOrgEmployee don't hit the network.
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import axios from "axios";

const { default: UsersService } = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
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
  });
});

describe("UsersService.importUsers — validation", () => {
  it("returns 400 when usersData is missing", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {},
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 400 when usersData is an empty array", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { usersData: [] },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 400 when one user is missing an email (named)", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { usersData: [{ full_name: "Pat Doe" }] },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Pat Doe/);
  });

  it("returns 400 when 3+ users miss emails (count phrasing)", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: {
        usersData: [
          { full_name: "A" },
          { full_name: "B" },
          { full_name: "C" },
        ],
      },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/3 users missing/);
  });

  it("returns 400 when the 'read' role is missing", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { usersData: [{ email: "ok@test.com", first_name: "X" }] },
    });
    await UsersService.importUsers(req, res);
    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toMatch(/Role 'read' not found/);
  });
});

describe("UsersService.allOrgEmployee", () => {
  it("returns failure when the admin does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId: "000000000000000000000000",
      body: { skip: 0, limit: 10 },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns failure when admin has no empData orgIds", async () => {
    // admin from beforeEach has no empData
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { skip: 0, limit: 10 },
    });
    await UsersService.allOrgEmployee(req, res);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/No organizations/);
  });
});

describe("UsersService.checkEmpAdmin — happy / negative axios paths", () => {
  it("reports isEmpAdmin:true when emp endpoint returns data", async () => {
    axios.post.mockResolvedValueOnce({
      data: { data: [{ orgId: "1", email: "x@y.com" }] },
    });
    const { req, res, next } = serviceCtx({ body: { email: "x@y.com" } });
    await UsersService.checkEmpAdmin(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.isEmpAdmin).toBe(true);
    expect(payload(res).data.empData).toHaveLength(1);
  });

  it("reports isEmpAdmin:false when emp endpoint returns empty", async () => {
    axios.post.mockResolvedValueOnce({ data: { data: [] } });
    const { req, res, next } = serviceCtx({ body: { email: "noone@t.test" } });
    await UsersService.checkEmpAdmin(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.isEmpAdmin).toBe(false);
  });

  it("reports isEmpAdmin:false when emp endpoint 404s (caught upstream)", async () => {
    const err = new Error("Not Found");
    err.response = { status: 404 };
    axios.post.mockRejectedValueOnce(err);
    const { req, res, next } = serviceCtx({ body: { email: "missing@t.test" } });
    await UsersService.checkEmpAdmin(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.isEmpAdmin).toBe(false);
  });
});
