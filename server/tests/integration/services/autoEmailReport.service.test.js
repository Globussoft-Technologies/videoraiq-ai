/**
 * Integration test for autoEmailReportService — the create/fetch/update/delete
 * paths against in-memory MongoDB. Cron-job wiring is already commented out in
 * the source, so no scheduler mocking is needed.
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
await import("../../../core/v1/users/users.model.js");

let admin;

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

describe("autoEmailReportService.createAutoEmailReport", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: validBody(),
    });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("fails validation for an empty body", async () => {
    const { req, res } = serviceCtx({ adminId: admin._id, body: {} });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("creates a report for a valid body", async () => {
    const { req, res } = serviceCtx({ adminId: admin._id, body: validBody() });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("success");
    expect(await AutoReport.countDocuments()).toBe(1);
  });

  it("rejects a duplicate report title", async () => {
    await AutoReport.create({ reportsTitle: "Daily Report", adminId: admin._id });
    const { req, res } = serviceCtx({ adminId: admin._id, body: validBody() });
    await AutoEmailReportService.createAutoEmailReport(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

describe("autoEmailReportService.fetchReportDetails", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the admin's reports with a total count", async () => {
    await AutoReport.create({ reportsTitle: "R1", adminId: admin._id });
    await AutoReport.create({ reportsTitle: "R2", adminId: admin._id });
    const { req, res } = serviceCtx({ adminId: admin._id, query: {} });
    await AutoEmailReportService.fetchReportDetails(req, res);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(2);
  });
});

describe("autoEmailReportService.updateReport", () => {
  it("fails when no report exists for the admin", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
      body: { reportsTitle: "Updated" },
    });
    await AutoEmailReportService.updateReport(req, res);
    expect(payload(res).status).toBe("failed");
  });
});

describe("autoEmailReportService.deleteReport", () => {
  it("fails for an unknown report id", async () => {
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: new mongoose.Types.ObjectId().toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("failed");
  });

  it("deletes an existing report", async () => {
    const report = await AutoReport.create({
      reportsTitle: "ToDelete",
      adminId: admin._id,
    });
    const { req, res } = serviceCtx({
      adminId: admin._id,
      query: { Id: report._id.toString() },
    });
    await AutoEmailReportService.deleteReport(req, res);
    expect(payload(res).status).toBe("success");
    expect(await AutoReport.findById(report._id)).toBeNull();
  });
});
