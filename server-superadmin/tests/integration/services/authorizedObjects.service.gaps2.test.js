/**
 * Gap-fill round 2 for authorizedObjects.service.js — every outer
 * catch arm + each "Admin not found" short-circuit that the existing
 * suite doesn't enter.
 *
 * Uncovered ranges per v8: 51-52, 71-72, 89-90, 104-105, 116-117,
 * 133-134, 157-158, 173-174, 189-190.
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

const { default: AuthorizedObjectsService } = await import(
  "../../../core/v1/authorizedObjects/authorizedObjects.service.js"
);
const { default: AuthorizedObjects } = await import(
  "../../../core/v1/authorizedObjects/authorizedObjects.model.js"
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
  vi.restoreAllMocks();
  admin = await Admin.create({
    user_id: "u-ao",
    login: "ao",
    email: "ao@test.com",
  });
});

function ctxFor(extra = {}) {
  return serviceCtx({
    user_id: admin.user_id,
    user_email: admin.email,
    adminId: admin._id,
    ...extra,
  });
}

describe("createAuthorizedObjects — outer catch (lines 51-52)", () => {
  it("sends Internal Server Error when create rejects", async () => {
    vi.spyOn(AuthorizedObjects, "create").mockImplementationOnce(() => {
      throw new Error("create-blew-up");
    });
    const { req, res } = ctxFor({
      body: { objectType: "vehicle", objectNames: ["car"] },
    });
    await AuthorizedObjectsService.createAuthorizedObjects(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Internal Server Error/);
  });
});

describe("fetchAuthorizedObjects — Admin not found (lines 70-72)", () => {
  it("sends userFailResp 'Admin not found' when adminModel.findOne returns null", async () => {
    vi.spyOn(Admin, "findOne").mockResolvedValueOnce(null);
    const { req, res } = ctxFor({ body: { objectTypes: [] } });
    await AuthorizedObjectsService.fetchAuthorizedObjects(req, res);
    expect(payload(res).message).toMatch(/Admin not found/i);
  });
});

describe("fetchAuthorizedObjects — outer catch (lines 89-90)", () => {
  it("sends Internal Server Error when find throws", async () => {
    vi.spyOn(AuthorizedObjects, "find").mockImplementationOnce(() => {
      throw new Error("find-blew-up");
    });
    const { req, res } = ctxFor({ body: { objectTypes: [] } });
    await AuthorizedObjectsService.fetchAuthorizedObjects(req, res);
    expect(payload(res).message).toMatch(/Internal Server Error/);
  });
});

describe("getAllObjectTypes — Admin not found (lines 103-105)", () => {
  it("sends userFailResp 'Admin not found'", async () => {
    vi.spyOn(Admin, "findOne").mockResolvedValueOnce(null);
    const { req, res } = ctxFor();
    await AuthorizedObjectsService.getAllObjectTypes(req, res);
    expect(payload(res).message).toMatch(/Admin not found/i);
  });
});

describe("getAllObjectTypes — outer catch (lines 115-117)", () => {
  it("sends Internal Server Error when find throws", async () => {
    vi.spyOn(AuthorizedObjects, "find").mockImplementationOnce(() => {
      throw new Error("find-types-blew-up");
    });
    const { req, res } = ctxFor();
    await AuthorizedObjectsService.getAllObjectTypes(req, res);
    expect(payload(res).message).toMatch(/Internal Server Error/);
  });
});

describe("updateAuthorizedObjects — Admin not found (lines 132-134)", () => {
  it("sends userFailResp 'Admin not found'", async () => {
    vi.spyOn(Admin, "findOne").mockResolvedValueOnce(null);
    const { req, res } = ctxFor({
      body: {
        _id: new mongoose.Types.ObjectId().toString(),
        objectType: "vehicle",
        objectNames: ["car"],
      },
    });
    await AuthorizedObjectsService.updateAuthorizedObjects(req, res);
    expect(payload(res).message).toMatch(/Admin not found/i);
  });
});

describe("updateAuthorizedObjects — outer catch (lines 156-158)", () => {
  it("sends Internal Server Error when findOne (existing record) throws", async () => {
    vi.spyOn(AuthorizedObjects, "findOne").mockImplementationOnce(() => {
      throw new Error("existing-find-blew-up");
    });
    const { req, res } = ctxFor({
      body: {
        _id: new mongoose.Types.ObjectId().toString(),
        objectType: "vehicle",
        objectNames: ["car"],
      },
    });
    await AuthorizedObjectsService.updateAuthorizedObjects(req, res);
    expect(payload(res).message).toMatch(/Internal Server Error/);
  });
});

describe("deleteAuthorizedObjects — Admin not found (lines 172-174)", () => {
  it("sends userFailResp 'Admin not found'", async () => {
    vi.spyOn(Admin, "findOne").mockResolvedValueOnce(null);
    const { req, res } = ctxFor({
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await AuthorizedObjectsService.deleteAuthorizedObjects(req, res);
    expect(payload(res).message).toMatch(/Admin not found/i);
  });
});

describe("deleteAuthorizedObjects — outer catch (lines 188-190)", () => {
  it("sends Internal Server Error when deleteOne throws", async () => {
    vi.spyOn(AuthorizedObjects, "deleteOne").mockImplementationOnce(() => {
      throw new Error("delete-blew-up");
    });
    const { req, res } = ctxFor({
      query: { id: new mongoose.Types.ObjectId().toString() },
    });
    await AuthorizedObjectsService.deleteAuthorizedObjects(req, res);
    expect(payload(res).message).toMatch(/Internal Server Error/);
  });
});
