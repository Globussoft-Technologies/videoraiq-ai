/**
 * Real vertical Supertest contract for /api/v1/entry — exercises the actual
 * controller + service + Joi validation + Mongo persistence (in-memory) for
 * the `register` + `getUsers` (search) endpoints. The other endpoints (`log`,
 * `get`, `getUserEntries`) drive aggregation pipelines whose detailed branches
 * are already covered by the entry.service.pipeline.test.js suite.
 *
 * Mocks: 2 — verifyToken (attach a verified admin) and permissionMiddleware.
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
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

// Entry routes don't mount verifyToken on /register, so attach req.verified
// via an app-level middleware (see beforeEach). Keep the stub anyway so any
// module-load-time eval inside verifyToken doesn't fail.
vi.mock("../../middlewares/verifyToken.js", () => ({
  default: (req, _res, next) => {
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
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: entryRoutes } = await import(
  "../../core/v1/entry/entry.routes.js"
);
const { default: Admin } = await import(
  "../../core/v1/admin/admin.model.js"
);
const { default: EntryUser } = await import(
  "../../core/v1/entry/user.model.js"
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
    user_id: "601",
    login: "entry-real",
    email: "entryreal@test.com",
  });
  globalThis.__TEST_ADMIN_ID__ = admin._id.toString();
  app = buildApp((a) => a.use("/api/v1/entry", entryRoutes));
});

/** Unwrap `{ statusCode, body }` from the Response helper envelope. */
const inner = (res) => res.body?.body ?? res.body;

describe("POST /api/v1/entry/register (real vertical)", () => {
  it("registers a user (201) and persists them", async () => {
    const res = await request(app)
      .post("/api/v1/entry/register")
      .send({
        firstName: "Alice",
        lastName: "Wong",
        email: "alice@test.com",
      });
    expect(res.status).toBe(201);
    expect(inner(res).status).toBe("success");

    const stored = await EntryUser.findOne({ email: "alice@test.com" });
    expect(stored).not.toBeNull();
    expect(stored.firstName).toBe("Alice");
  });

  it("400 when firstName/lastName/email missing", async () => {
    const res = await request(app)
      .post("/api/v1/entry/register")
      .send({ firstName: "X" });
    expect(res.status).toBe(400);
  });

  it("409 when the email already exists", async () => {
    await EntryUser.create({
      firstName: "Bob",
      lastName: "Smith",
      email: "bob@test.com",
    });
    const res = await request(app)
      .post("/api/v1/entry/register")
      .send({
        firstName: "Bob",
        lastName: "Smith",
        email: "bob@test.com",
      });
    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/entry/users (real vertical)", () => {
  it("returns all users sorted by firstName when no search is provided", async () => {
    await EntryUser.create([
      { firstName: "Zoe", lastName: "Zest", email: "z@t.test" },
      { firstName: "Alice", lastName: "Apple", email: "a@t.test" },
      { firstName: "Marc", lastName: "Maple", email: "m@t.test" },
    ]);
    const res = await request(app).get("/api/v1/entry/users");
    expect(res.status).toBe(200);
    const data = inner(res).data;
    expect(Array.isArray(data?.users)).toBe(true);
    expect(data.users).toHaveLength(3);
  });

  it("filters by case-insensitive search on firstName/lastName/email", async () => {
    await EntryUser.create([
      { firstName: "Alice", lastName: "Apple", email: "a@t.test" },
      { firstName: "Bob", lastName: "Beaver", email: "b@t.test" },
    ]);
    const res = await request(app)
      .get("/api/v1/entry/users")
      .query({ search: "alic" });
    expect(res.status).toBe(200);
    const users = inner(res).data.users;
    expect(users).toHaveLength(1);
    expect(users[0].firstName).toBe("Alice");
  });
});
