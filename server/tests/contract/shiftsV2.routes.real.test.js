/**
 * Real vertical Supertest contract for /api/v2/shifts — the Shift Management
 * surface: CRUD plus individual and bulk assignment.
 *
 * Mounts the actual v2 router with the real controller + service + Joi
 * validation + Mongo persistence (in-memory). Only verifyToken and the four
 * permission middlewares are stubbed, matching shifts.routes.real.test.js.
 *
 * Response envelope: the service uses `res.status(N).json(Response.xxx(...))`,
 * so the HTTP status is honoured AND the body is double-nested
 * `{ statusCode, body: { status, message, data } }`.
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

/** The v2 router mounts no auth of its own — v2.js does — so attach here. */
function attachVerified(req, _res, next) {
  req.verified = {
    state: true,
    userData: {
      adminId: globalThis.__TEST_ADMIN_ID__,
      user_id: 99,
      memberId: undefined,
    },
    authorizedChannel: null,
    permissionConfig: [{ permissionConfig: {} }],
  };
  next();
}

const { buildApp } = await import("../helpers/app.js");
const { default: shiftsRoutes } = await import(
  "../../core/v2/shifts/shifts.routes.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: Shift } = await import("../../core/v2/shifts/shifts.model.js");
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
    user_id: "801",
    login: "shift-v2",
    email: "shiftv2@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => {
    a.use(attachVerified);
    a.use("/api/v2/shifts", shiftsRoutes);
  });
});

/** Unwrap `{ statusCode, body }` from the Response helper envelope. */
const inner = (res) => res.body?.body ?? res.body;

const validShift = (over = {}) => ({
  name: "General Shift",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 60,
  graceLateMinutes: 15,
  graceEarlyMinutes: 15,
  maxOvertimeMinutes: 0,
  workingDays: {
    sunday: { type: "off" },
    monday: { type: "full" },
    tuesday: { type: "full" },
    wednesday: { type: "full" },
    thursday: { type: "full" },
    friday: { type: "full" },
    saturday: { type: "off" },
  },
  ...over,
});

const makeEmployee = (over = {}) =>
  AuthorizedUser.create({
    adminId: admin._id,
    firstName: "Emp",
    lastName: String(over.email || Math.random()),
    location: "Pune",
    ...over,
  });

describe("POST /api/v2/shifts", () => {
  it("creates a shift from the Create Shift form payload (201)", async () => {
    const res = await request(app).post("/api/v2/shifts").send(validShift());

    expect(res.status).toBe(201);
    const shift = inner(res).data.shift;
    expect(shift.name).toBe("General Shift");
    expect(shift.breakMinutes).toBe(60);
    expect(shift.graceLateMinutes).toBe(15);
    expect(shift.weekOffDays).toEqual(["sunday", "saturday"]);
    expect(shift.workingDayCount).toBe(5);
    // 0 is a sentinel for "system default", resolved for the client.
    expect(shift.effectiveMaxOvertimeMinutes).toBe(12 * 60);
    // No colour picker in the form, so the service assigns one.
    expect(shift.color).toBeTruthy();
  });

  it("makes the first shift in a tenant the default", async () => {
    const first = await request(app).post("/api/v2/shifts").send(validShift());
    expect(inner(first).data.shift.isDefault).toBe(true);

    const second = await request(app)
      .post("/api/v2/shifts")
      .send(validShift({ name: "Night Shift" }));
    expect(inner(second).data.shift.isDefault).toBe(false);
  });

  it("keeps at most one default shift per tenant", async () => {
    await request(app).post("/api/v2/shifts").send(validShift());
    await request(app)
      .post("/api/v2/shifts")
      .send(validShift({ name: "Night Shift", isDefault: true }));

    const defaults = await Shift.find({ adminId: admin._id, isDefault: true });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Night Shift");
  });

  it("rejects a duplicate name regardless of casing", async () => {
    await request(app).post("/api/v2/shifts").send(validShift());
    const res = await request(app)
      .post("/api/v2/shifts")
      .send(validShift({ name: "general shift" }));

    expect(res.status).toBe(400);
    expect(inner(res).error[0]).toMatch(/already exists/i);
  });

  it("rejects a malformed time", async () => {
    const res = await request(app)
      .post("/api/v2/shifts")
      .send(validShift({ startTime: "9am" }));
    expect(res.status).toBe(400);
    expect(inner(res).error.join(" ")).toMatch(/HH:MM/);
  });

  it("accepts a half day and a night-shift window", async () => {
    const res = await request(app).post("/api/v2/shifts").send(
      validShift({
        name: "Night Shift",
        startTime: "22:00",
        endTime: "06:00",
        workingDays: { saturday: { type: "half", start: "22:00", end: "02:00" } },
      }),
    );

    expect(res.status).toBe(201);
    const shift = inner(res).data.shift;
    expect(shift.isNightShift).toBe(true);
    expect(shift.workingDays.saturday).toEqual({
      type: "half",
      start: "22:00",
      end: "02:00",
    });
  });
});

describe("GET /api/v2/shifts", () => {
  it("returns only the caller's own shifts", async () => {
    const otherAdmin = new mongoose.Types.ObjectId();
    await Shift.create({ adminId: admin._id, name: "Mine" });
    await Shift.create({ adminId: otherAdmin, name: "Theirs" });

    const res = await request(app).get("/api/v2/shifts");

    expect(res.status).toBe(200);
    expect(inner(res).data.total).toBe(1);
    expect(inner(res).data.shifts[0].name).toBe("Mine");
  });

  it("reports how many employees hold each shift", async () => {
    const shift = await Shift.create({ adminId: admin._id, name: "Morning" });
    await makeEmployee({ email: "a@t.com", shiftId: shift._id });
    await makeEmployee({ email: "b@t.com", shiftId: shift._id });
    await makeEmployee({ email: "c@t.com" });

    const res = await request(app).get("/api/v2/shifts");
    expect(inner(res).data.shifts[0].assignedEmployees).toBe(2);
  });

  it("filters by case-insensitive name", async () => {
    await Shift.create({ adminId: admin._id, name: "Morning" });
    await Shift.create({ adminId: admin._id, name: "Evening" });

    const res = await request(app).get("/api/v2/shifts").query({ name: "MORN" });
    expect(inner(res).data.total).toBe(1);
  });
});

describe("GET/PUT/DELETE /api/v2/shifts/:id", () => {
  it("404s on another tenant's shift instead of leaking it", async () => {
    const foreign = await Shift.create({
      adminId: new mongoose.Types.ObjectId(),
      name: "Theirs",
    });

    expect((await request(app).get(`/api/v2/shifts/${foreign._id}`)).status).toBe(404);
    expect(
      (await request(app).put(`/api/v2/shifts/${foreign._id}`).send({ name: "Hijacked" }))
        .status,
    ).toBe(404);
    expect((await request(app).delete(`/api/v2/shifts/${foreign._id}`)).status).toBe(404);

    // And it is genuinely untouched.
    expect((await Shift.findById(foreign._id)).name).toBe("Theirs");
  });

  it("updates a subset of fields and re-syncs the legacy mirrors", async () => {
    const created = await request(app).post("/api/v2/shifts").send(validShift());
    const id = inner(created).data.shift._id;

    const res = await request(app)
      .put(`/api/v2/shifts/${id}`)
      .send({ graceLateMinutes: 30, workingDays: { saturday: { type: "half" } } });

    expect(res.status).toBe(200);
    const shift = await Shift.findById(id);
    expect(shift.graceLateMinutes).toBe(30);
    expect(shift.settings.lateLogin).toBe(30);
    // A half day still expects the employee, so the legacy flag flips to true.
    expect(shift.timings.saturday.enabled).toBe(true);
    // Untouched days survive the partial update.
    expect(shift.workingDays.monday.type).toBe("full");
  });

  // v1 clients speak `timings`. Their updates have to land, not be swallowed
  // by the `workingDays` block the v2 form wrote.
  it("applies a legacy timings-only update", async () => {
    const created = await request(app).post("/api/v2/shifts").send(validShift());
    const id = inner(created).data.shift._id;

    const res = await request(app)
      .put(`/api/v2/shifts/${id}`)
      .send({ timings: { monday: { enabled: false } } });

    expect(res.status).toBe(200);
    expect(inner(res).data.shift.workingDays.monday.type).toBe("off");
    const shift = await Shift.findById(id);
    expect(shift.workingDays.monday.type).toBe("off");
    expect(shift.timings.monday.enabled).toBe(false);
    // Days the legacy payload didn't mention are left alone.
    expect(shift.workingDays.tuesday.type).toBe("full");
  });

  it("unassigns employees when the shift is deleted", async () => {
    const shift = await Shift.create({ adminId: admin._id, name: "Morning" });
    const employee = await makeEmployee({ email: "a@t.com", shiftId: shift._id });

    const res = await request(app).delete(`/api/v2/shifts/${shift._id}`);

    expect(res.status).toBe(200);
    expect(inner(res).data.unassignedEmployees).toBe(1);
    expect((await AuthorizedUser.findById(employee._id)).shiftId).toBeNull();
  });
});

describe("POST /api/v2/shifts/:id/assign", () => {
  let shift;
  let engineering;
  let sales;

  beforeEach(async () => {
    shift = await Shift.create({ adminId: admin._id, name: "Morning" });
    engineering = await Department.create({
      adminId: admin._id,
      departmentName: "Engineering",
    });
    sales = await Department.create({ adminId: admin._id, departmentName: "Sales" });

    await makeEmployee({ email: "p-eng@t.com", location: "Pune", departmentId: engineering._id });
    await makeEmployee({ email: "p-sales@t.com", location: "Pune", departmentId: sales._id });
    await makeEmployee({ email: "m-eng@t.com", location: "Mumbai", departmentId: engineering._id });
    await makeEmployee({ email: "suspended@t.com", location: "Pune", status: "suspended" });
  });

  it("assigns to named employees", async () => {
    const employee = await AuthorizedUser.findOne({ email: "p-eng@t.com" });

    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ employeeIds: [employee._id.toString()] });

    expect(res.status).toBe(200);
    expect(inner(res).data.modified).toBe(1);
    expect(String((await AuthorizedUser.findById(employee._id)).shiftId)).toBe(
      String(shift._id),
    );
  });

  it("ANDs the location and department filters", async () => {
    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"], departmentIds: [engineering._id.toString()] });

    expect(inner(res).data.modified).toBe(1);
    expect(
      await AuthorizedUser.countDocuments({ shiftId: shift._id }),
    ).toBe(1);
  });

  it("matches locations case-insensitively", async () => {
    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["  pUnE "] });

    // Both active Pune employees; the suspended one is excluded by default.
    expect(inner(res).data.modified).toBe(2);
  });

  it("includes suspended staff only when asked", async () => {
    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"], includeSuspended: true });

    expect(inner(res).data.modified).toBe(3);
  });

  it("leaves existing assignments alone when overwriteExisting is false", async () => {
    const other = await Shift.create({ adminId: admin._id, name: "Evening" });
    const held = await AuthorizedUser.findOneAndUpdate(
      { email: "p-eng@t.com" },
      { shiftId: other._id },
      { new: true },
    );

    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"], overwriteExisting: false });

    expect(inner(res).data.modified).toBe(1);
    expect(String((await AuthorizedUser.findById(held._id)).shiftId)).toBe(
      String(other._id),
    );
  });

  it("assigns everyone only when allEmployees is set explicitly", async () => {
    const refused = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({});
    expect(refused.status).toBe(400);
    expect(await AuthorizedUser.countDocuments({ shiftId: shift._id })).toBe(0);

    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ allEmployees: true });
    expect(inner(res).data.modified).toBe(3);
  });

  it("does not count employees already on the shift as modified", async () => {
    await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"] });

    const again = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"] });

    expect(inner(again).data.modified).toBe(0);
  });

  it("refuses to assign an inactive shift", async () => {
    await Shift.findByIdAndUpdate(shift._id, { isActive: false });

    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"] });

    expect(res.status).toBe(400);
    expect(inner(res).error.join(" ")).toMatch(/inactive/i);
  });

  // `search` is preview-only. The write path rejects it rather than ignoring
  // it, so a client that sent one can't believe it narrowed the assignment.
  it("rejects a search term instead of letting it scope a bulk write", async () => {
    const res = await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"], search: "p-eng" });

    expect(res.status).toBe(400);
    expect(await AuthorizedUser.countDocuments({ shiftId: shift._id })).toBe(0);
  });

  it("404s on another tenant's shift", async () => {
    const foreign = await Shift.create({
      adminId: new mongoose.Types.ObjectId(),
      name: "Theirs",
    });
    const res = await request(app)
      .post(`/api/v2/shifts/${foreign._id}/assign`)
      .send({ allEmployees: true });

    expect(res.status).toBe(404);
    expect(await AuthorizedUser.countDocuments({ shiftId: foreign._id })).toBe(0);
  });

  it("never reaches across tenants when picking targets", async () => {
    const outsider = await AuthorizedUser.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Outsider",
      email: "outsider@t.com",
      location: "Pune",
    });

    await request(app)
      .post(`/api/v2/shifts/${shift._id}/assign`)
      .send({ locations: ["Pune"] });

    expect((await AuthorizedUser.findById(outsider._id)).shiftId).toBeNull();
  });
});

describe("POST /api/v2/shifts/assignments/preview", () => {
  beforeEach(async () => {
    await makeEmployee({ email: "p1@t.com", location: "Pune" });
    await makeEmployee({ email: "p2@t.com", location: "Pune" });
    await makeEmployee({ email: "m1@t.com", location: "Mumbai" });
  });

  it("reports how many employees a filter set matches without writing", async () => {
    const res = await request(app)
      .post("/api/v2/shifts/assignments/preview")
      .send({ locations: ["Pune"] });

    expect(res.status).toBe(200);
    expect(inner(res).data.matched).toBe(2);
    expect(inner(res).data.unassigned).toBe(2);
    expect(inner(res).data.employees).toHaveLength(2);
    expect(await AuthorizedUser.countDocuments({ shiftId: { $ne: null } })).toBe(0);
  });

  it("splits the match into already-assigned and unassigned", async () => {
    const shift = await Shift.create({ adminId: admin._id, name: "Morning" });
    await AuthorizedUser.findOneAndUpdate({ email: "p1@t.com" }, { shiftId: shift._id });

    const res = await request(app)
      .post("/api/v2/shifts/assignments/preview")
      .send({ locations: ["Pune"] });

    expect(inner(res).data.alreadyAssigned).toBe(1);
    expect(inner(res).data.unassigned).toBe(1);
  });

  // Read-only, so an empty filter set previews the whole org rather than
  // erroring — that is what drives the running count in the Bulk Assign modal.
  it("previews the whole org for an empty filter set", async () => {
    const res = await request(app).post("/api/v2/shifts/assignments/preview").send({});
    expect(inner(res).data.matched).toBe(3);
  });

  // Backs the assign modal's employee picker, which has to search a roster too
  // large to ship to the browser.
  it("searches employees by name and email", async () => {
    await makeEmployee({ email: "nadia.k@t.com", firstName: "Nadia", lastName: "Khan" });

    const byName = await request(app)
      .post("/api/v2/shifts/assignments/preview")
      .send({ search: "nadia" });
    expect(inner(byName).data.matched).toBe(1);

    const byEmail = await request(app)
      .post("/api/v2/shifts/assignments/preview")
      .send({ search: "NADIA.K@T.COM" });
    expect(inner(byEmail).data.matched).toBe(1);

    const noMatch = await request(app)
      .post("/api/v2/shifts/assignments/preview")
      .send({ search: "nobody" });
    expect(inner(noMatch).data.matched).toBe(0);
  });
});

describe("PATCH /api/v2/shifts/assignments/unassign", () => {
  it("clears the shift on the named employees only", async () => {
    const shift = await Shift.create({ adminId: admin._id, name: "Morning" });
    const a = await makeEmployee({ email: "a@t.com", shiftId: shift._id });
    const b = await makeEmployee({ email: "b@t.com", shiftId: shift._id });

    const res = await request(app)
      .patch("/api/v2/shifts/assignments/unassign")
      .send({ employeeIds: [a._id.toString()] });

    expect(res.status).toBe(200);
    expect(inner(res).data.modified).toBe(1);
    expect((await AuthorizedUser.findById(a._id)).shiftId).toBeNull();
    expect(String((await AuthorizedUser.findById(b._id)).shiftId)).toBe(String(shift._id));
  });

  it("cannot unassign another tenant's employee", async () => {
    const foreignShift = await Shift.create({
      adminId: new mongoose.Types.ObjectId(),
      name: "Theirs",
    });
    const outsider = await AuthorizedUser.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Outsider",
      email: "outsider@t.com",
      shiftId: foreignShift._id,
    });

    const res = await request(app)
      .patch("/api/v2/shifts/assignments/unassign")
      .send({ employeeIds: [outsider._id.toString()] });

    expect(inner(res).data.modified).toBe(0);
    expect((await AuthorizedUser.findById(outsider._id)).shiftId).not.toBeNull();
  });
});

describe("GET /api/v2/shifts/:id/employees", () => {
  it("returns the roster for one shift", async () => {
    const shift = await Shift.create({ adminId: admin._id, name: "Morning" });
    const other = await Shift.create({ adminId: admin._id, name: "Evening" });
    await makeEmployee({ email: "a@t.com", shiftId: shift._id });
    await makeEmployee({ email: "b@t.com", shiftId: shift._id });
    await makeEmployee({ email: "c@t.com", shiftId: other._id });

    const res = await request(app).get(`/api/v2/shifts/${shift._id}/employees`);

    expect(res.status).toBe(200);
    expect(inner(res).data.total).toBe(2);
    expect(inner(res).data.shiftName).toBe("Morning");
  });
});

describe("GET /api/v2/shifts/list", () => {
  it("returns active shifts with the default first", async () => {
    await Shift.create({ adminId: admin._id, name: "Evening" });
    await Shift.create({ adminId: admin._id, name: "Morning", isDefault: true });
    await Shift.create({ adminId: admin._id, name: "Retired", isActive: false });

    const res = await request(app).get("/api/v2/shifts/list");

    const shifts = inner(res).data.shifts;
    expect(shifts).toHaveLength(2);
    expect(shifts[0].name).toBe("Morning");
  });
});
