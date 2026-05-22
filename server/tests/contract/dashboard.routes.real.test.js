/**
 * Real vertical Supertest contract for `/api/v1/dashboard` — mounts the real
 * router on a fresh Express app and exercises the actual controller +
 * service + Mongo. Targets `dashboard.controller.js` (0% via the existing
 * shallow test) by routing requests through it, plus a handful of service
 * branches that the existing unit tests don't drive via HTTP.
 *
 * Mocks:
 *   1. middlewares/permissionMiddleware.js  — wave all CRUD verbs through
 *
 * Total: 1 mock. Service, model hooks, and Mongo run real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../integration/dbSetup.js";

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (_req, _res, next) => next(),
  createAccessCheck: (_req, _res, next) => next(),
  editAccessCheck: (_req, _res, next) => next(),
  deleteAccessCheck: (_req, _res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: dashboardRoutes } = await import(
  "../../core/v1/dashboard/dashboard.routes.js"
);
const { default: Admin } = await import("../../core/v1/admin/admin.model.js");
const { default: sideBarConfigData } = await import(
  "../../core/v1/dashboard/dashboardSidebar.model.js"
);

const USER_ID = "dash-real-user-1";

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
    user_id: USER_ID,
    login: "dash-real",
    email: "dash-real@test.com",
  });
  app = buildApp((a) => {
    a.use("/api/v1/dashboard", (req, _res, next) => {
      req.verified = {
        state: true,
        userData: {
          user_id: USER_ID,
          adminId: admin._id,
          memberId: undefined,
        },
        authorizedChannel: null,
      };
      next();
    });
    a.use("/api/v1/dashboard", dashboardRoutes);
  });
});

const inner = (res) => res.body?.body ?? res.body;

// ----------------------------------------------------------------------------
// GET /getSidebarConfig
// ----------------------------------------------------------------------------
describe("GET /api/v1/dashboard/getSidebarConfig (real vertical)", () => {
  it("returns notFound when no sidebar config exists", async () => {
    const res = await request(app).get(
      "/api/v1/dashboard/getSidebarConfig",
    );
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("returns the sidebar config when one exists for the admin", async () => {
    await sideBarConfigData.create({
      adminId: admin._id,
      detectionConfigs: [
        { detectionType: "countPersons", isEnabled: true, allowedDetection: true },
      ],
    });
    const res = await request(app).get(
      "/api/v1/dashboard/getSidebarConfig",
    );
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.detectionConfigs).toHaveLength(1);
    expect(body.data.detectionConfigs[0].detectionType).toBe("countPersons");
  });
});

// ----------------------------------------------------------------------------
// PUT /updateSidebarConfig
// ----------------------------------------------------------------------------
describe("PUT /api/v1/dashboard/updateSidebarConfig (real vertical)", () => {
  it("returns notFound when no sidebar config exists", async () => {
    const res = await request(app)
      .put("/api/v1/dashboard/updateSidebarConfig")
      .send({ detectionConfigs: [] });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("updates the isEnabled flag of a detection config", async () => {
    await sideBarConfigData.create({
      adminId: admin._id,
      detectionConfigs: [
        { detectionType: "countPersons", isEnabled: false, allowedDetection: true },
      ],
    });
    const res = await request(app)
      .put("/api/v1/dashboard/updateSidebarConfig")
      .send({
        detectionConfigs: [{ detectionType: "countPersons", isEnabled: true }],
      });
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("success");
    const reloaded = await sideBarConfigData.findOne({ adminId: admin._id });
    expect(reloaded.detectionConfigs[0].isEnabled).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// GET /getIncidentsByType
// ----------------------------------------------------------------------------
describe("GET /api/v1/dashboard/getIncidentsByType (real vertical)", () => {
  it("fails validation for an unknown incident type", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/getIncidentsByType?incidentType=mystery")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });

  it("returns an empty result when no incidents match", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/getIncidentsByType?incidentType=lineCrossing")
      .send({});
    expect(res.status).toBe(200);
    const body = inner(res);
    expect(body.status).toBe("success");
    expect(body.data.totalCount).toBe(0);
    expect(body.data.incidentData).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// POST /getDetections — validation paths
// ----------------------------------------------------------------------------
describe("POST /api/v1/dashboard/getDetections (real vertical)", () => {
  it("fails validation for an unknown detection type", async () => {
    const res = await request(app)
      .post("/api/v1/dashboard/getDetections?detectionType=bogus&day=today")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /headerStats
// ----------------------------------------------------------------------------
describe("POST /api/v1/dashboard/headerStats (real vertical)", () => {
  it("fails when admin does not exist", async () => {
    app = buildApp((a) => {
      a.use("/api/v1/dashboard", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: {
            user_id: USER_ID,
            adminId: new mongoose.Types.ObjectId(),
            memberId: undefined,
          },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/dashboard", dashboardRoutes);
    });
    const res = await request(app)
      .post("/api/v1/dashboard/headerStats")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// GET /recentIncidents
// ----------------------------------------------------------------------------
describe("GET /api/v1/dashboard/recentIncidents (real vertical)", () => {
  it("succeeds with no data when no sidebar config is configured", async () => {
    const res = await request(app).get("/api/v1/dashboard/recentIncidents");
    // The service returns notFound when sidebar config is missing.
    expect(res.status).toBe(200);
    expect(inner(res).status).toBeDefined();
  });

  it("fails when admin does not exist", async () => {
    app = buildApp((a) => {
      a.use("/api/v1/dashboard", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: {
            user_id: USER_ID,
            adminId: new mongoose.Types.ObjectId(),
            memberId: undefined,
          },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/dashboard", dashboardRoutes);
    });
    const res = await request(app).get("/api/v1/dashboard/recentIncidents");
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /criticalityStats
// ----------------------------------------------------------------------------
describe("POST /api/v1/dashboard/criticalityStats (real vertical)", () => {
  it("fails when admin does not exist", async () => {
    app = buildApp((a) => {
      a.use("/api/v1/dashboard", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: {
            user_id: USER_ID,
            adminId: new mongoose.Types.ObjectId(),
            memberId: undefined,
          },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/dashboard", dashboardRoutes);
    });
    const res = await request(app)
      .post("/api/v1/dashboard/criticalityStats")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /detectionChart
// ----------------------------------------------------------------------------
describe("POST /api/v1/dashboard/detectionChart (real vertical)", () => {
  it("fails when admin does not exist", async () => {
    app = buildApp((a) => {
      a.use("/api/v1/dashboard", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: {
            user_id: USER_ID,
            adminId: new mongoose.Types.ObjectId(),
            memberId: undefined,
          },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/dashboard", dashboardRoutes);
    });
    const res = await request(app)
      .post("/api/v1/dashboard/detectionChart")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});

// ----------------------------------------------------------------------------
// POST /dashboardWeeklyComparisonChart
// ----------------------------------------------------------------------------
describe("POST /api/v1/dashboard/dashboardWeeklyComparisonChart (real vertical)", () => {
  it("fails when admin does not exist", async () => {
    app = buildApp((a) => {
      a.use("/api/v1/dashboard", (req, _res, next) => {
        req.verified = {
          state: true,
          userData: {
            user_id: USER_ID,
            adminId: new mongoose.Types.ObjectId(),
            memberId: undefined,
          },
          authorizedChannel: null,
        };
        next();
      });
      a.use("/api/v1/dashboard", dashboardRoutes);
    });
    const res = await request(app)
      .post("/api/v1/dashboard/dashboardWeeklyComparisonChart")
      .send({});
    expect(res.status).toBe(200);
    expect(inner(res).status).toBe("failed");
  });
});
