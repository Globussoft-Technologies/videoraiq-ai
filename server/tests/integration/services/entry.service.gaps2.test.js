/**
 * Gap-fill round 2 for entry.service.js.
 *
 * Uncovered ranges per v8 — all outer catches after existing tests:
 *   52-56    register outer catch
 *   193-197  log outer catch
 *   228-232  get outer catch
 *   461-463  buildEntryPipeline outer catch (throws "Failed to build entry pipeline")
 *   510-514  getUsers outer catch
 *   560-564  getUserEntries outer catch
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

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { entryLog: vi.fn().mockResolvedValue(undefined) },
}));

const { default: EntryService } = await import(
  "../../../core/v1/entry/entry.service.js"
);
const { default: Entry } = await import(
  "../../../core/v1/entry/entry.model.js"
);
const { default: EntryUser } = await import(
  "../../../core/v1/entry/user.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
});

describe("EntryService.register — outer catch (lines 51-56)", () => {
  it("returns 500 'Failed to register user' when EntryUser.create throws", async () => {
    vi.spyOn(EntryUser, "create").mockImplementationOnce(() => {
      throw new Error("user-create-blew-up");
    });
    const { req, res } = serviceCtx({
      body: {
        firstName: "F",
        lastName: "L",
        email: "x@test.com",
      },
    });
    await EntryService.register(req, res);
    expect(res.statusCode).toBe(500);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("EntryService.log — outer catch (lines 192-197)", () => {
  it("returns 500 'Failed to log hit' when Admin.findById throws", async () => {
    vi.spyOn(Admin, "findById").mockImplementationOnce(() => {
      throw new Error("admin-find-blew-up");
    });
    const { req, res } = serviceCtx({
      body: {
        adminId: new mongoose.Types.ObjectId().toString(),
        userId: new mongoose.Types.ObjectId().toString(),
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        images: { face: "http://img/face" },
      },
    });
    await EntryService.log(req, res);
    expect(res.statusCode).toBe(500);
  });
});

describe("EntryService.get — outer catch (lines 227-232)", () => {
  it("returns 500 when Entry.aggregate throws", async () => {
    vi.spyOn(Entry, "aggregate").mockImplementationOnce(() => {
      throw new Error("entry-aggregate-blew-up");
    });
    const { req, res } = serviceCtx({ body: {}, query: {} });
    await EntryService.get(req, res);
    expect(res.statusCode).toBe(500);
  });
});

describe("EntryService.buildEntryPipeline — outer catch (lines 460-463)", () => {
  it("throws 'Failed to build entry pipeline' on internal error", () => {
    // new mongoose.Types.ObjectId(adminId) at line 255 throws for an
    // invalid-format adminId — that escapes into the outer catch.
    const req = {
      query: {},
      verified: { userData: { adminId: "not-an-objectid" } },
    };
    expect(() => EntryService.buildEntryPipeline(req)).toThrow(
      /Failed to build entry pipeline/,
    );
  });
});

describe("EntryService.getUsers — outer catch (lines 509-514)", () => {
  it("returns 500 when EntryUser.find throws", async () => {
    vi.spyOn(EntryUser, "find").mockImplementationOnce(() => {
      throw new Error("user-find-blew-up");
    });
    const { req, res } = serviceCtx({ query: {} });
    await EntryService.getUsers(req, res);
    expect(res.statusCode).toBe(500);
  });
});

describe("EntryService.getUserEntries — outer catch (lines 559-564)", () => {
  it("returns 500 when Entry.find throws", async () => {
    vi.spyOn(Entry, "find").mockImplementationOnce(() => {
      throw new Error("entry-find-blew-up");
    });
    const { req, res } = serviceCtx({
      params: { userId: new mongoose.Types.ObjectId().toString() },
      query: {},
    });
    await EntryService.getUserEntries(req, res);
    expect(res.statusCode).toBe(500);
  });
});
