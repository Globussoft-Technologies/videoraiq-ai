import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v1/incidents/incidents.controller.js", () => ({
  default: {
    createIncidents: vi.fn(async (req, res) => res.status(201).json({ success: true, data: { _id: "inc1" } })),
    getAllIncidents: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getAllIncidentsById: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    updateIncident: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteIncidentsByIds: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteIncident: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getIncidentsDetails: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
    updateReportStatus: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    getIncidentLists: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    deskAbsenceData: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    guardAbsenceData: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getVehicleDetectionLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getVehicleNumbers: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getConveyorDetectionLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getCrusherDetectionLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getWaterSpillageDetectionLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getVehicleCountLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getLineCrossingLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getPersonCountLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getDeskAbsenceLogs: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    getDeskAbsenceZoneNames: vi.fn(async (req, res) => res.status(200).json({ success: true, data: [] })),
    editIncidentDetails: vi.fn(async (req, res) => res.status(200).json({ success: true })),
    deleteIncidentsByAdminAndDateRange: vi.fn(async (req, res) => res.status(202).json({ success: true })),
    getDeletionJobStatus: vi.fn(async (req, res) => res.status(200).json({ success: true, data: {} })),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: incidentsRoutes } = await import("../../core/v1/incidents/incidents.routes.js");

let app;
beforeEach(() => {
  app = buildApp((a) => a.use("/api/v1/incidents", incidentsRoutes));
});

describe("POST /api/v1/incidents/create", () => {
  it("returns 201 on incident creation", async () => {
    const res = await request(app)
      .post("/api/v1/incidents/create")
      .send({ type: "intrusion", channelId: "ch1" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("POST /api/v1/incidents/", () => {
  it("returns 200 with incidents list", async () => {
    const res = await request(app).post("/api/v1/incidents/").send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("GET /api/v1/incidents/getIncident", () => {
  it("returns 200 with incident data", async () => {
    const res = await request(app).get("/api/v1/incidents/getIncident");
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/v1/incidents/:id", () => {
  it("returns 200 on update", async () => {
    const res = await request(app)
      .put("/api/v1/incidents/inc123")
      .send({ status: "resolved" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/incidents/delete-by-incidentIds", () => {
  it("returns 200 on bulk delete", async () => {
    const res = await request(app)
      .delete("/api/v1/incidents/delete-by-incidentIds")
      .send({ ids: ["inc1"] });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/incidents/getIncidentsDetails", () => {
  it("returns 200 with incident details", async () => {
    const res = await request(app)
      .post("/api/v1/incidents/getIncidentsDetails")
      .send({ incidentId: "inc1" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/incidents/update-report-status", () => {
  it("returns 200 on status update", async () => {
    const res = await request(app)
      .post("/api/v1/incidents/update-report-status")
      .send({ incidentId: "inc1", status: "reviewed" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/getIncidentLists", () => {
  it("returns 200 with incident lists", async () => {
    const res = await request(app).get("/api/v1/incidents/getIncidentLists");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/incidents/deskAbsenceData", () => {
  it("returns 200", async () => {
    const res = await request(app).post("/api/v1/incidents/deskAbsenceData").send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/incidents/guardAbsenceData", () => {
  it("returns 200", async () => {
    const res = await request(app).post("/api/v1/incidents/guardAbsenceData").send({});
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/vehicle-detection", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/vehicle-detection");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/vehicle-detection/numbers", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/vehicle-detection/numbers");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/conveyor-detection", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/conveyor-detection");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/crusher-detection", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/crusher-detection");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/water-spillage-detection", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/water-spillage-detection");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/vehicle-count", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/vehicle-count");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/incidents/logs/line-crossing", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/api/v1/incidents/logs/line-crossing");
    expect(res.status).toBe(200);
  });
});
