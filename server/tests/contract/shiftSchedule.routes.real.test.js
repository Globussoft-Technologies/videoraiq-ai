/**
 * Real vertical Supertest contract for the Shift Schedule surface —
 * /api/v2/shifts/schedule and its assignment endpoints.
 *
 * The thing worth pinning here is the precedence: a cell is an explicit
 * override if one exists, otherwise it is derived from the employee's standing
 * shift and that shift's working-day pattern, otherwise it is empty. Only
 * deviations are stored, so a tenant that never edits a day writes no rows at
 * all — and the grid still comes back fully populated.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
    req.verified = { state: true, userData: { adminId: globalThis.__TEST_ADMIN_ID__ } };
    next();
  },
}));
vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

function attachVerified(req, _res, next) {
  req.verified = {
    state: true,
    userData: { adminId: globalThis.__TEST_ADMIN_ID__, user_id: 99, memberId: undefined },
    authorizedChannel: null,
    permissionConfig: [{ permissionConfig: {} }],
  };
  next();
}

const { buildApp } = await import("../helpers/app.js");
const { default: shiftsRoutes } = await import("../../core/v2/shifts/shifts.routes.js");
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: Shift } = await import("../../core/v2/shifts/shifts.model.js");
const { default: ShiftSchedule } = await import(
  "../../core/v2/shifts/shiftSchedule.model.js"
);
const { default: AuthorizedUser } = await import(
  "../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: Department } = await import(
  "../../core/v2/departments/departments.model.js"
);

let app;
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
    user_id: "805",
    login: "shift-schedule",
    email: "shiftschedule@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => {
    a.use(attachVerified);
    a.use("/api/v2/shifts", shiftsRoutes);
  });
});

const inner = (res) => res.body?.body ?? res.body;

// September 2026: the 1st is a Tuesday, the 5th a Saturday, the 6th a Sunday.
const MONTH = "2026-09";

const makeEmployee = (over = {}) =>
  AuthorizedUser.create({
    adminId: admin._id,
    firstName: "Aarav",
    lastName: "Mehta",
    location: "HQ",
    ...over,
  });

const dayShift = (over = {}) =>
  Shift.create({
    adminId: admin._id,
    name: "General Shift",
    startTime: "09:00",
    endTime: "18:00",
    ...over,
  });

const getSchedule = (query = {}) =>
  request(app).post("/api/v2/shifts/schedule").send({ month: MONTH, ...query });

describe("GET/POST /api/v2/shifts/schedule", () => {
  it("returns every day of the month with weekday labels", async () => {
    await makeEmployee({ email: "a@t.com" });

    const res = await getSchedule();

    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(data.days).toHaveLength(30);
    expect(data.days[0]).toMatchObject({ key: "2026-09-01", day: 1, weekday: "tuesday" });
    expect(data.days[29].key).toBe("2026-09-30");
    // The 5th is a Saturday.
    expect(data.days[4]).toMatchObject({ weekday: "saturday", isWeekend: true });
  });

  it("derives every cell from the standing shift without storing a single row", async () => {
    const shift = await dayShift(); // Mon-Fri by default
    await makeEmployee({ email: "a@t.com", shiftId: shift._id });

    const res = await getSchedule();
    const [row] = inner(res).data.employees;

    // Tuesday the 1st is a working day; Saturday the 5th is a week off.
    expect(row.cells["2026-09-01"]).toMatchObject({ type: "full", source: "standing" });
    expect(row.cells["2026-09-01"].shift.name).toBe("General Shift");
    expect(row.cells["2026-09-05"]).toMatchObject({ type: "off", source: "standing" });

    // Nothing persisted — the grid is entirely derived.
    expect(await ShiftSchedule.countDocuments()).toBe(0);
  });

  it("leaves an employee with no shift as empty cells", async () => {
    await makeEmployee({ email: "a@t.com" });

    const res = await getSchedule();
    const [row] = inner(res).data.employees;

    expect(row.standingShift).toBeNull();
    expect(row.cells["2026-09-01"]).toMatchObject({ type: "none", source: "none" });
  });

  it("carries the employee identity the grid's first column needs", async () => {
    const department = await Department.create({
      adminId: admin._id,
      departmentName: "Engineering",
    });
    await makeEmployee({
      email: "a@t.com",
      emp_id: 435,
      designation: "Technician",
      departmentId: department._id,
    });

    const [row] = inner(await getSchedule()).data.employees;
    expect(row).toMatchObject({
      firstName: "Aarav",
      employeeCode: 435,
      designation: "Technician",
      department: "Engineering",
      location: "HQ",
    });
  });

  it("returns the shift catalogue for the legend and cell picker", async () => {
    await dayShift();
    await dayShift({ name: "Night Shift", startTime: "22:00", endTime: "06:00" });
    await makeEmployee({ email: "a@t.com" });

    const data = inner(await getSchedule()).data;
    expect(data.shifts.map((s) => s.name).sort()).toEqual(["General Shift", "Night Shift"]);
  });

  it("rejects a malformed month rather than guessing", async () => {
    const res = await request(app).post("/api/v2/shifts/schedule").send({ month: "Sept 2026" });
    expect(res.status).toBe(400);
    expect(inner(res).error.join(" ")).toMatch(/YYYY-MM/);
  });

  it("scopes to the caller's own tenant", async () => {
    await AuthorizedUser.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Outsider",
      email: "out@t.com",
    });
    await makeEmployee({ email: "a@t.com" });

    const data = inner(await getSchedule()).data;
    expect(data.total).toBe(1);
    expect(data.employees[0].firstName).toBe("Aarav");
  });

  describe("search and filters", () => {
    beforeEach(async () => {
      const engineering = await Department.create({
        adminId: admin._id,
        departmentName: "Engineering",
      });
      await makeEmployee({
        firstName: "Aarav",
        email: "aarav@t.com",
        emp_id: 435,
        location: "Pune",
        designation: "Technician",
        departmentId: engineering._id,
      });
      await makeEmployee({
        firstName: "Nadia",
        email: "nadia@t.com",
        emp_id: 991,
        location: "Mumbai",
        designation: "Supervisor",
      });
    });

    it("searches by name", async () => {
      const data = inner(await getSchedule({ search: "nadi" })).data;
      expect(data.total).toBe(1);
      expect(data.employees[0].firstName).toBe("Nadia");
    });

    it("searches by employee code", async () => {
      const data = inner(await getSchedule({ search: "435" })).data;
      expect(data.total).toBe(1);
      expect(data.employees[0].employeeCode).toBe(435);
    });

    // emp_id is numeric, so a non-numeric term must not reach it as a regex.
    it("survives a non-numeric search without a cast error", async () => {
      const res = await getSchedule({ search: "aarav@t.com" });
      expect(res.status).toBe(200);
      expect(inner(res).data.total).toBe(1);
    });

    it("filters by location, case-insensitively", async () => {
      const data = inner(await getSchedule({ locations: ["  pUnE "] })).data;
      expect(data.total).toBe(1);
      expect(data.employees[0].location).toBe("Pune");
    });

    it("filters by designation", async () => {
      const data = inner(await getSchedule({ designations: ["Supervisor"] })).data;
      expect(data.total).toBe(1);
      expect(data.employees[0].firstName).toBe("Nadia");
    });

    it("paginates", async () => {
      const first = inner(await getSchedule({ limit: 1, skip: 0 })).data;
      const second = inner(await getSchedule({ limit: 1, skip: 1 })).data;
      expect(first.total).toBe(2);
      expect(first.employees).toHaveLength(1);
      expect(first.employees[0]._id).not.toBe(second.employees[0]._id);
    });
  });
});

describe("PUT /api/v2/shifts/schedule/day", () => {
  it("overrides one day without touching the rest of the week", async () => {
    const shift = await dayShift();
    const night = await dayShift({ name: "Night", startTime: "22:00", endTime: "06:00" });
    const employee = await makeEmployee({ email: "a@t.com", shiftId: shift._id });

    const res = await request(app).put("/api/v2/shifts/schedule/day").send({
      employeeId: employee._id.toString(),
      date: "2026-09-03",
      shiftId: night._id.toString(),
    });

    expect(res.status).toBe(200);
    const [row] = inner(await getSchedule()).data.employees;
    expect(row.cells["2026-09-03"]).toMatchObject({ type: "full", source: "override" });
    expect(row.cells["2026-09-03"].shift.name).toBe("Night");
    // Neighbouring days still inherit.
    expect(row.cells["2026-09-02"]).toMatchObject({ source: "standing" });
    expect(row.cells["2026-09-02"].shift.name).toBe("General Shift");
  });

  it("marks a working day off", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ email: "a@t.com", shiftId: shift._id });

    await request(app).put("/api/v2/shifts/schedule/day").send({
      employeeId: employee._id.toString(),
      date: "2026-09-02",
      isOff: true,
    });

    const [row] = inner(await getSchedule()).data.employees;
    expect(row.cells["2026-09-02"]).toMatchObject({ type: "off", source: "override" });
  });

  it("assigns a half day", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ email: "a@t.com", shiftId: shift._id });

    await request(app).put("/api/v2/shifts/schedule/day").send({
      employeeId: employee._id.toString(),
      date: "2026-09-02",
      shiftId: shift._id.toString(),
      dayType: "half",
    });

    const [row] = inner(await getSchedule()).data.employees;
    expect(row.cells["2026-09-02"].type).toBe("half");
  });

  it("is idempotent — re-assigning the same day updates rather than duplicates", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ email: "a@t.com", shiftId: shift._id });
    const body = {
      employeeId: employee._id.toString(),
      date: "2026-09-02",
      shiftId: shift._id.toString(),
    };

    await request(app).put("/api/v2/shifts/schedule/day").send(body);
    await request(app).put("/api/v2/shifts/schedule/day").send({ ...body, isOff: true });

    expect(await ShiftSchedule.countDocuments()).toBe(1);
    const [row] = inner(await getSchedule()).data.employees;
    expect(row.cells["2026-09-02"].type).toBe("off");
  });

  it("404s on another tenant's employee", async () => {
    const outsider = await AuthorizedUser.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Outsider",
      email: "out@t.com",
    });

    const res = await request(app).put("/api/v2/shifts/schedule/day").send({
      employeeId: outsider._id.toString(),
      date: "2026-09-02",
      isOff: true,
    });

    expect(res.status).toBe(404);
    expect(await ShiftSchedule.countDocuments()).toBe(0);
  });

  it("404s on another tenant's shift", async () => {
    const employee = await makeEmployee({ email: "a@t.com" });
    const foreign = await Shift.create({
      adminId: new mongoose.Types.ObjectId(),
      name: "Theirs",
    });

    const res = await request(app).put("/api/v2/shifts/schedule/day").send({
      employeeId: employee._id.toString(),
      date: "2026-09-02",
      shiftId: foreign._id.toString(),
    });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v2/shifts/schedule/bulk", () => {
  it("assigns a shift across a date range", async () => {
    const shift = await dayShift();
    const a = await makeEmployee({ email: "a@t.com" });
    const b = await makeEmployee({ email: "b@t.com" });

    const res = await request(app).put("/api/v2/shifts/schedule/bulk").send({
      employeeIds: [a._id.toString(), b._id.toString()],
      shiftId: shift._id.toString(),
      from: "2026-09-01",
      to: "2026-09-05",
    });

    expect(res.status).toBe(200);
    expect(inner(res).data).toMatchObject({ employees: 2, days: 5 });
    expect(await ShiftSchedule.countDocuments()).toBe(10);
  });

  it("narrows a range to selected weekdays", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ email: "a@t.com" });

    // Mondays and Fridays only, across the whole month.
    const res = await request(app).put("/api/v2/shifts/schedule/bulk").send({
      employeeIds: [employee._id.toString()],
      shiftId: shift._id.toString(),
      from: "2026-09-01",
      to: "2026-09-30",
      weekdays: [1, 5],
    });

    // September 2026 has 4 Mondays and 4 Fridays.
    expect(inner(res).data.days).toBe(8);
    const dates = (await ShiftSchedule.find().lean()).map((r) => r.date);
    expect(dates).toContain("2026-09-07"); // Monday
    expect(dates).not.toContain("2026-09-02"); // Wednesday
  });

  it("accepts an explicit list of dates", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ email: "a@t.com" });

    const res = await request(app).put("/api/v2/shifts/schedule/bulk").send({
      employeeIds: [employee._id.toString()],
      shiftId: shift._id.toString(),
      dates: ["2026-09-10", "2026-09-20"],
    });

    expect(inner(res).data.days).toBe(2);
  });

  it("overwrites an existing override rather than duplicating it", async () => {
    const shift = await dayShift();
    const night = await dayShift({ name: "Night", startTime: "22:00", endTime: "06:00" });
    const employee = await makeEmployee({ email: "a@t.com" });

    const body = { employeeIds: [employee._id.toString()], from: "2026-09-01", to: "2026-09-03" };
    await request(app)
      .put("/api/v2/shifts/schedule/bulk")
      .send({ ...body, shiftId: shift._id.toString() });
    await request(app)
      .put("/api/v2/shifts/schedule/bulk")
      .send({ ...body, shiftId: night._id.toString() });

    expect(await ShiftSchedule.countDocuments()).toBe(3);
    const [row] = inner(await getSchedule()).data.employees;
    expect(row.cells["2026-09-02"].shift.name).toBe("Night");
  });

  it("refuses a range with neither dates nor from/to", async () => {
    const employee = await makeEmployee({ email: "a@t.com" });
    const res = await request(app)
      .put("/api/v2/shifts/schedule/bulk")
      .send({ employeeIds: [employee._id.toString()] });

    expect(res.status).toBe(400);
    expect(inner(res).error.join(" ")).toMatch(/either an explicit/i);
  });

  it("refuses a backwards range", async () => {
    const employee = await makeEmployee({ email: "a@t.com" });
    const res = await request(app).put("/api/v2/shifts/schedule/bulk").send({
      employeeIds: [employee._id.toString()],
      from: "2026-09-20",
      to: "2026-09-10",
    });

    expect(res.status).toBe(400);
  });

  it("never writes for another tenant's employee", async () => {
    const outsider = await AuthorizedUser.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Outsider",
      email: "out@t.com",
    });
    const res = await request(app).put("/api/v2/shifts/schedule/bulk").send({
      employeeIds: [outsider._id.toString()],
      from: "2026-09-01",
      to: "2026-09-05",
    });

    expect(res.status).toBe(404);
    expect(await ShiftSchedule.countDocuments()).toBe(0);
  });
});

describe("PATCH /api/v2/shifts/schedule/clear", () => {
  it("restores inheritance from the standing shift", async () => {
    const shift = await dayShift();
    const night = await dayShift({ name: "Night", startTime: "22:00", endTime: "06:00" });
    const employee = await makeEmployee({ email: "a@t.com", shiftId: shift._id });

    await request(app).put("/api/v2/shifts/schedule/day").send({
      employeeId: employee._id.toString(),
      date: "2026-09-02",
      shiftId: night._id.toString(),
    });

    const res = await request(app).patch("/api/v2/shifts/schedule/clear").send({
      employeeIds: [employee._id.toString()],
      dates: ["2026-09-02"],
    });

    expect(res.status).toBe(200);
    expect(inner(res).data.cleared).toBe(1);

    const [row] = inner(await getSchedule()).data.employees;
    // Back to the standing shift, not to an empty cell.
    expect(row.cells["2026-09-02"]).toMatchObject({ source: "standing" });
    expect(row.cells["2026-09-02"].shift.name).toBe("General Shift");
  });

  it("clears a whole range", async () => {
    const shift = await dayShift();
    const employee = await makeEmployee({ email: "a@t.com" });

    await request(app).put("/api/v2/shifts/schedule/bulk").send({
      employeeIds: [employee._id.toString()],
      shiftId: shift._id.toString(),
      from: "2026-09-01",
      to: "2026-09-10",
    });

    const res = await request(app).patch("/api/v2/shifts/schedule/clear").send({
      employeeIds: [employee._id.toString()],
      from: "2026-09-01",
      to: "2026-09-30",
    });

    expect(inner(res).data.cleared).toBe(10);
    expect(await ShiftSchedule.countDocuments()).toBe(0);
  });
});

describe("GET /api/v2/shifts/schedule/designations", () => {
  it("returns distinct non-empty designations, sorted", async () => {
    await makeEmployee({ email: "a@t.com", designation: "Technician" });
    await makeEmployee({ email: "b@t.com", designation: "Analyst" });
    await makeEmployee({ email: "c@t.com", designation: "Technician" });
    await makeEmployee({ email: "d@t.com" });

    const res = await request(app).get("/api/v2/shifts/schedule/designations");
    expect(inner(res).data.designations).toEqual(["Analyst", "Technician"]);
  });
});
