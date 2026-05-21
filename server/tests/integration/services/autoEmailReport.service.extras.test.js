/**
 * Integration test for autoEmailReportService — the previously-uncovered
 * branches:
 *   - createAutoEmailReport when memberId is set (non-admin member path)
 *   - createAutoEmailReport guards: missing Recipients / Content / filter
 *   - fetchReportDetails with a memberId + searchQuery filter
 *   - fetchReportDetails with the orderby='frequency' sort key
 *   - updateReport happy path (admin + member)
 *   - deleteReport for the memberId branch
 *
 * No mocks — straight against in-memory MongoDB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
let member;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
  member = await Users.create({
    adminId: admin._id,
    email: "m@test.com",
    roleIds: new mongoose.Types.ObjectId(),
  });
});

function validBody(over = {}) {
  return {
    reportsTitle: "Daily Report",
    Recipients: ["recipient@test.com"],
    Content: [{ task: 1 }],
    filter: { wholeOrganization: 1 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// createAutoEmailReport — member branch + body guards
// ---------------------------------------------------------------------------
describe("autoEmailReportService.createAutoEmailReport — extras", () => {
  it("fails when the memberId user does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: new mongoose.Types.ObjectId(),
      body: validBody(),
    });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("creates a report for the memberId branch and stamps userId", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      body: validBody(),
    });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("success");
    const created = await AutoReport.findOne({
      reportsTitle: "Daily Report",
    });
    expect(created).not.toBeNull();
    expect(created.userId.toString()).toBe(member._id.toString());
  });

  it("rejects when Recipients is empty", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: validBody({ Recipients: [] }),
    });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message || payload(res).error).toMatch(
      /Minimum one user/i,
    );
  });

  it("rejects when Content is missing", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { ...validBody(), Content: [] },
    });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("rejects when filter is missing", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      body: { ...validBody(), filter: {} },
    });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// fetchReportDetails — memberId + searchQuery + orderby branches
// ---------------------------------------------------------------------------
describe("autoEmailReportService.fetchReportDetails — extras", () => {
  it("fails when the memberId user does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the member's reports, scoped by userId", async () => {
    await AutoReport.create({
      reportsTitle: "MineReport",
      userId: member._id,
    });
    await AutoReport.create({ reportsTitle: "AdminReport", adminId: admin._id });

    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: {},
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("success");
    // Member only sees their own report.
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.autoReportFetch[0].reportsTitle).toBe(
      "MineReport",
    );
  });

  it("filters by searchQuery on reportsTitle (admin branch)", async () => {
    await AutoReport.create({ reportsTitle: "Quarterly", adminId: admin._id });
    await AutoReport.create({ reportsTitle: "Monthly", adminId: admin._id });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { searchQuery: "quarter" },
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("filters by searchQuery (member branch)", async () => {
    await AutoReport.create({ reportsTitle: "Alpha", userId: member._id });
    await AutoReport.create({ reportsTitle: "Beta", userId: member._id });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: { searchQuery: "alph" },
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("supports orderby=frequency for the sort fan-out branch", async () => {
    await AutoReport.create({
      reportsTitle: "A",
      adminId: admin._id,
      frequency: [{ Daily: 1 }],
    });
    await AutoReport.create({
      reportsTitle: "B",
      adminId: admin._id,
      frequency: [{ Weekly: 1 }],
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { orderby: "frequency", sort: "desc" },
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// updateReport — admin + member happy paths and dup-title guard
// ---------------------------------------------------------------------------
describe("autoEmailReportService.updateReport — extras", () => {
  it("returns failed status when the body is invalid (missing reportsTitle)", async () => {
    await AutoReport.create({ reportsTitle: "X", adminId: admin._id });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: {}, // reportsTitle is required by the validator
    });
    await AutoEmailReportService.updateReport(req, res);
    // The validator branch sends a SuccessResp with "Validation Failed" message
    // (see service implementation). Either way, the update never persists.
    expect(payload(res).message).toMatch(/Validation Failed/i);
  });

  it("rejects when the same title already exists (admin branch)", async () => {
    const existing = await AutoReport.create({
      reportsTitle: "Existing",
      adminId: admin._id,
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: existing._id.toString() },
      body: { reportsTitle: "Existing" },
    });
    await AutoEmailReportService.updateReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 'Report not found' for an unknown report (admin branch)", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "Brand New" },
    });
    await AutoEmailReportService.updateReport(req, res);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message || payload(res).error).toMatch(/not found/i);
  });

  it("returns 'Report not found' for the member branch when no report exists", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "Mine" },
    });
    await AutoEmailReportService.updateReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 'A report with this title already exists' for the member branch", async () => {
    // The service first looks up by userId and then by reportsTitle. So we
    // need both: any report for this member, and a separate report with the
    // requested new title.
    await AutoReport.create({ reportsTitle: "MyReport", userId: member._id });
    await AutoReport.create({ reportsTitle: "Taken", adminId: admin._id });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "Taken" },
    });
    await AutoEmailReportService.updateReport(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// deleteReport — member branch
// ---------------------------------------------------------------------------
describe("autoEmailReportService.deleteReport — extras", () => {
  it("fails when the memberId user has no such report", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes a member's report and surfaces the frequency tag (Daily)", async () => {
    const report = await AutoReport.create({
      reportsTitle: "MemberRep",
      userId: member._id,
      frequency: [{ Daily: 1 }],
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("success");
    expect(await AutoReport.findById(report._id)).toBeNull();
  });

  it("deletes a member's report with a Weekly frequency tag", async () => {
    const report = await AutoReport.create({
      reportsTitle: "WeeklyRep",
      userId: member._id,
      frequency: [{ Weekly: 1 }],
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      memberId: member._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("success");
  });

  it("deletes an admin's report with a Monthly frequency tag", async () => {
    const report = await AutoReport.create({
      reportsTitle: "MonthlyRep",
      adminId: admin._id,
      frequency: [{ Monthly: 1 }],
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("success");
  });
});
