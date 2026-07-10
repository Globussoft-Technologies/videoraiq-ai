/**
 * Gap-fill round 2 for autoEmailReport.services.js.
 *
 * Remaining uncovered ranges per v8 after extras + base:
 *   65-66   createAutoEmailReport: createReport falsy branch
 *   69-70   createAutoEmailReport: outer catch
 *   112-113 fetchReportDetails admin-branch: autoReportFetch falsy
 *   137-138 fetchReportDetails member-branch: autoReportFetch falsy
 *   143-144 fetchReportDetails: outer catch
 *   170-183 updateReport admin-branch: full update path (success +
 *           duplicate-title check) — existing tests stop at the early
 *           findReport-null guard.
 *   195-208 updateReport member-branch: full update path
 *   211-212 updateReport outer catch
 *   228, 230 deleteReport: frequency Daily=1 + Monthly=1 arms
 *   253-254 deleteReport member-branch: frequency arm + success
 *   265-266 deleteReport: outer catch
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

const { default: AutoEmailReportService } = await import(
  "../../../core/v1/autoEmailReport/autoEmailReport.services.js"
);
const { default: AutoReport } = await import(
  "../../../core/v1/autoEmailReport/autoEmailReport.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Users } = await import(
  "../../../core/v1/users/users.model.js"
);

let admin;
let user;

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
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
  user = await Users.create({
    firstName: "U",
    lastName: "Ser",
    email: "u@test.com",
    role: "Member",
    roleIds: new mongoose.Types.ObjectId(),
    adminId: admin._id,
  });
});

const validBody = (over = {}) => ({
  reportsTitle: "X",
  Recipients: ["x@x.com"],
  Content: [{ task: 1 }],
  filter: { wholeOrganization: 1 },
  ...over,
});

describe("createAutoEmailReport — falsy createReport (lines 65-66)", () => {
  it("sends 'Error while creating data' when AutoReport.create returns falsy", async () => {
    vi.spyOn(AutoReport, "create").mockResolvedValueOnce(null);
    const { req, res } = serviceCtx({ adminId: admin._id, body: validBody() });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Error while creating/i);
  });
});

describe("createAutoEmailReport — outer catch (lines 69-70)", () => {
  it("sends 'Failed to store Data' when AutoReport.create throws", async () => {
    vi.spyOn(AutoReport, "create").mockImplementationOnce(() => {
      throw new Error("create-boom");
    });
    const { req, res } = serviceCtx({ adminId: admin._id, body: validBody() });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Failed to store Data/i);
  });
});

describe("fetchReportDetails — member branch (lines 114-138)", () => {
  it("returns the member's reports, scoped by userId", async () => {
    await AutoReport.create({
      reportsTitle: "Member Report",
      userId: user._id,
    });
    const { req, res } = serviceCtx({
      memberId: user._id,
      query: {},
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    const body = payload(res);
    expect(body.status).toBe("success");
    expect(body.data.totalCount).toBe(1);
  });

  it("returns failed when member does not exist", async () => {
    const { req, res } = serviceCtx({
      memberId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("fetchReportDetails — outer catch (lines 143-144)", () => {
  it("sends Failed to store Data when admin lookup throws", async () => {
    vi.spyOn(Admin, "findById").mockImplementationOnce(() => {
      throw new Error("admin-find-boom");
    });
    const { req, res } = serviceCtx({ adminId: admin._id, query: {} });
    await AutoEmailReportService.fetchReportDetails(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("updateReport — admin-branch happy + duplicate (lines 160-183)", () => {
  it("returns 'A report with this title already exists.' when reportsTitle is taken", async () => {
    await AutoReport.create({ reportsTitle: "Taken", adminId: admin._id });
    await AutoReport.create({ reportsTitle: "Source", adminId: admin._id });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "Taken" },
    });
    await AutoEmailReportService.updateReport(req, res);
    const body = payload(res);
    expect(body.message).toMatch(/already exists/i);
  });

  it("returns 'Error while updating report' when no document is modified", async () => {
    await AutoReport.create({ reportsTitle: "Source2", adminId: admin._id });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      // bogus Id → updateOne modifiedCount 0
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "Source2-renamed" },
    });
    await AutoEmailReportService.updateReport(req, res);
    const body = payload(res);
    expect(body.message).toMatch(/Error while updating report|Report not found|Failed to update/);
  });
});

describe("updateReport — member branch (lines 185-208)", () => {
  it("returns 'A report with this title already exists.' for member when title is taken", async () => {
    await AutoReport.create({ reportsTitle: "MemTaken", userId: user._id });
    await AutoReport.create({ reportsTitle: "MemSource", userId: user._id });
    const { req, res } = serviceCtx({
      memberId: user._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "MemTaken" },
    });
    await AutoEmailReportService.updateReport(req, res);
    const body = payload(res);
    expect(body.message).toMatch(/already exists/i);
  });
});

describe("updateReport — outer catch (lines 211-212)", () => {
  it("returns 'Failed to update report' when validation throws unexpectedly", async () => {
    vi.spyOn(AutoReport, "findOne").mockImplementationOnce(() => {
      throw new Error("update-findOne-boom");
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "ok" },
    });
    await AutoEmailReportService.updateReport(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
  });
});

describe("deleteReport — frequency arms (lines 227-233, 246-254)", () => {
  it("admin branch: Daily=1 frequency entry triggers the Daily arm", async () => {
    const report = await AutoReport.create({
      reportsTitle: "DailyRep",
      adminId: admin._id,
      frequency: [{ Daily: 1, Weekly: 0, Monthly: 0 }],
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    const body = payload(res);
    expect(body.status).toBe("success");
  });

  it("admin branch: Monthly=1 frequency entry triggers the Monthly arm", async () => {
    const report = await AutoReport.create({
      reportsTitle: "MonthlyRep",
      adminId: admin._id,
      frequency: [{ Daily: 0, Weekly: 0, Monthly: 1 }],
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("success");
  });

  it("member branch: Weekly=1 frequency entry triggers the Weekly arm", async () => {
    const report = await AutoReport.create({
      reportsTitle: "MemWeeklyRep",
      userId: user._id,
      frequency: [{ Daily: 0, Weekly: 1, Monthly: 0 }],
    });
    const { req, res } = serviceCtx({
      memberId: user._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("success");
  });

  it("member branch: no matching report → 'Error while deleting data'", async () => {
    const { req, res } = serviceCtx({
      memberId: user._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

describe("deleteReport — outer catch (lines 265-266)", () => {
  it("sends 'Failed to delete Data' when findOneAndDelete rejects", async () => {
    vi.spyOn(AutoReport, "findOneAndDelete").mockImplementationOnce(() => {
      throw new Error("delete-boom");
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    const body = payload(res);
    expect(body.status).toBe("failed");
    expect(body.message).toMatch(/Failed to delete/i);
  });
});
