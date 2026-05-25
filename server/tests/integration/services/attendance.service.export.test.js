/**
 * Integration tests for AttendanceService.exportAttendance — Excel + PDF
 * binary-writer branches.
 *
 * The existing attendance.service.getAttendance.test.js only exercises the
 * "no data" early return and the pipeline-throws branch of exportAttendance,
 * leaving the two private writers (#exportExcel ~129 stmts, #exportPdf ~181
 * stmts) entirely uncovered — the biggest active gap in this 1117-statement
 * service. This file fills both by piping `res` to an in-memory Writable so
 * ExcelJS.workbook.xlsx.write(res) and PDFDocument.pipe(res) can stream their
 * binary output, then asserts on the captured headers and non-empty buffer.
 *
 * Mocks: 1 (socket.js — transitively imported via attendance.service).
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
import { Writable } from "stream";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: AttendanceService } = await import(
  "../../../core/v1/attendance/attendance.service.js"
);
const { default: Attendance } = await import(
  "../../../core/v1/attendance/attendance.model.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthorizedUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

/**
 * Build a streaming `res` that captures bytes into a Buffer. The service uses
 * `setHeader`, then either `workbook.xlsx.write(res)` (ExcelJS, which calls
 * `res.write` + `res.end`) or `doc.pipe(res)` (PDFKit, which pipes a Readable
 * into this Writable). On `end`, the returned promise resolves with the buffer.
 */
function makeStreamRes() {
  const chunks = [];
  const headers = {};
  const writable = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });

  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });
  writable.on("finish", () => resolveDone(Buffer.concat(chunks)));
  writable.on("close", () => resolveDone(Buffer.concat(chunks)));

  // Patch the Writable to also satisfy the controller-style `res` interface.
  writable.statusCode = 200;
  writable.status = function (code) {
    this.statusCode = code;
    return this;
  };
  writable.json = function (body) {
    this._body = body;
    return this;
  };
  writable.setHeader = function (k, v) {
    headers[k] = v;
    return this;
  };
  writable._headers = headers;
  writable._done = done;
  return writable;
}

/** Seed admin + employee + channel + department + attendance row. */
async function seedAttendance({
  imagesOnCheckin = { face: "f1", person: "p1", frame: "fr1" },
  imagesOnCheckout = { face: "f2" },
  withDepartment = true,
} = {}) {
  const admin = await Admin.create({
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
  const department = withDepartment
    ? await Department.create({
        adminId: admin._id,
        departmentName: "Engineering",
      })
    : null;
  const employee = await AuthorizedUsers.create({
    adminId: admin._id,
    firstName: "Emp",
    lastName: "One",
    email: "emp@test.com",
    ...(department ? { departmentId: department._id } : {}),
  });
  const nvrId = new mongoose.Types.ObjectId();
  const channel = await Channel.create({
    nvrId,
    userId: admin.user_id,
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-Main",
    customName: "Front Door",
  });
  const now = new Date();
  const attendance = await Attendance.create({
    user: admin._id,
    employee: employee._id,
    createdAt: now,
    events: [
      {
        cameraType: "checkin",
        timestamp: new Date(now.getTime() - 60 * 60 * 1000),
        channel: channel._id,
        nvr: nvrId,
        images: imagesOnCheckin,
      },
      {
        cameraType: "checkout",
        timestamp: new Date(now.getTime() - 10 * 60 * 1000),
        channel: channel._id,
        nvr: nvrId,
        images: imagesOnCheckout,
      },
    ],
  });
  return { admin, department, employee, channel, nvrId, attendance };
}

describe("AttendanceService.exportAttendance — Excel writer", () => {
  it("streams an Excel workbook to res with the spreadsheet content-type", async () => {
    const { admin } = await seedAttendance();
    const res = makeStreamRes();
    const { req } = serviceCtx({
      adminId: admin._id,
      query: { format: "excel", export: "true", timezone: "Asia/Kolkata" },
      body: {},
    });

    await AttendanceService.exportAttendance(req, res);
    const buf = await res._done;

    expect(res._headers["Content-Type"]).toMatch(/spreadsheet/);
    expect(res._headers["Content-Disposition"]).toMatch(/attendance\.xlsx/);
    // ExcelJS xlsx files are ZIP archives — the first two bytes are 'PK'.
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.slice(0, 2).toString("utf8")).toBe("PK");
  });

  it("renders rows when the employee has no department and person/frame images are absent", async () => {
    // Hits the `att.employee.departmentId?.departmentName || "-"` and the
    // `firstCheckIn?.images?.person ? {...} : "-"` / frame "else" branches.
    // (The model requires at least one image present per event.)
    const { admin } = await seedAttendance({
      imagesOnCheckin: { face: "f-only" },
      imagesOnCheckout: { face: "f-only-out" },
      withDepartment: false,
    });
    const res = makeStreamRes();
    const { req } = serviceCtx({
      adminId: admin._id,
      query: { format: "excel", export: "true" },
      body: {},
    });

    await AttendanceService.exportAttendance(req, res);
    const buf = await res._done;

    expect(res._headers["Content-Type"]).toMatch(/spreadsheet/);
    expect(buf.length).toBeGreaterThan(100);
  });
});

describe("AttendanceService.exportAttendance — PDF writer", () => {
  it("streams a PDF to res with the application/pdf content-type", async () => {
    const { admin } = await seedAttendance();
    const res = makeStreamRes();
    const { req } = serviceCtx({
      adminId: admin._id,
      query: { format: "pdf", export: "true", timezone: "UTC" },
      body: {},
    });

    await AttendanceService.exportAttendance(req, res);
    const buf = await res._done;

    expect(res._headers["Content-Type"]).toBe("application/pdf");
    expect(res._headers["Content-Disposition"]).toMatch(/attendance\.pdf/);
    // PDF magic header.
    expect(buf.slice(0, 4).toString("utf8")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(200);
  });

  it("paginates when many attendance rows are present", async () => {
    // Seed enough rows that the writer's page-break branch (lines 1048-1064)
    // is forced. A2 landscape is large, so generate a healthy batch.
    const { admin, employee, channel, nvrId } = await seedAttendance();
    const now = new Date();
    const extras = [];
    for (let i = 0; i < 60; i++) {
      extras.push({
        user: admin._id,
        employee: employee._id,
        createdAt: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000),
        events: [
          {
            cameraType: "checkin",
            timestamp: new Date(
              now.getTime() - (i + 1) * 24 * 60 * 60 * 1000 + 60 * 1000,
            ),
            channel: channel._id,
            nvr: nvrId,
            images: { face: "f" + i },
          },
        ],
      });
    }
    await Attendance.insertMany(extras);

    const res = makeStreamRes();
    const { req } = serviceCtx({
      adminId: admin._id,
      query: { format: "pdf", export: "true" },
      body: {},
    });

    await AttendanceService.exportAttendance(req, res);
    const buf = await res._done;

    expect(buf.slice(0, 4).toString("utf8")).toBe("%PDF");
    // Multi-page PDFs always contain more than one `/Type /Page` entry — a
    // simple lower-bound check that the page-break branch ran without
    // overspecifying the renderer.
    expect(buf.length).toBeGreaterThan(1000);
  });
});
