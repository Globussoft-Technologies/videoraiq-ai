/**
 * Route contract for core/v2/globalSchedule/globalSchedule.routes.js
 *
 * The controller is mocked — this pins the URL surface, the HTTP verbs, and
 * (importantly) that /nvr/:nvrId/cameras is matched before /:id rather than
 * being swallowed by it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../core/v2/globalSchedule/globalSchedule.controller.js", () => ({
  default: {
    getNvrCameras: vi.fn(async (req, res) =>
      res.status(200).json({ route: "nvrCameras", nvrId: req.params.nvrId }),
    ),
    getAllGlobalSchedules: vi.fn(async (req, res) =>
      res.status(200).json({ route: "list", nvrId: req.query.nvrId ?? null }),
    ),
    createGlobalSchedule: vi.fn(async (req, res) => res.status(201).json({ route: "create" })),
    getGlobalSchedule: vi.fn(async (req, res) =>
      res.status(200).json({ route: "get", id: req.params.id }),
    ),
    updateGlobalSchedule: vi.fn(async (req, res) =>
      res.status(200).json({ route: "update", id: req.params.id }),
    ),
    deleteGlobalSchedule: vi.fn(async (req, res) =>
      res.status(200).json({ route: "delete", id: req.params.id }),
    ),
  },
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: globalScheduleRoutes } = await import(
  "../../core/v2/globalSchedule/globalSchedule.routes.js"
);

const BASE = "/api/v2/global-schedules";
const SCHEDULE_ID = "650000000000000000000501";
const NVR_ID = "650000000000000000000a01";

let app;
beforeEach(() => {
  app = buildApp((a) => a.use(BASE, globalScheduleRoutes));
});

describe("global schedule routes", () => {
  it("GET /nvr/:nvrId/cameras resolves to the NVR-cameras handler, not /:id", async () => {
    const res = await request(app).get(`${BASE}/nvr/${NVR_ID}/cameras`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: "nvrCameras", nvrId: NVR_ID });
  });

  it("GET / lists schedules", async () => {
    const res = await request(app).get(`${BASE}/`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ route: "list" });
  });

  it("GET /?nvrId= passes the filter through", async () => {
    const res = await request(app).get(`${BASE}/?nvrId=${NVR_ID}`);

    expect(res.body).toEqual({ route: "list", nvrId: NVR_ID });
  });

  it("POST / creates", async () => {
    const res = await request(app).post(`${BASE}/`).send({ nvrId: NVR_ID });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ route: "create" });
  });

  it("GET /:id fetches one", async () => {
    const res = await request(app).get(`${BASE}/${SCHEDULE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: "get", id: SCHEDULE_ID });
  });

  it("PUT /:id updates", async () => {
    const res = await request(app).put(`${BASE}/${SCHEDULE_ID}`).send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: "update", id: SCHEDULE_ID });
  });

  it("DELETE /:id deletes", async () => {
    const res = await request(app).delete(`${BASE}/${SCHEDULE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: "delete", id: SCHEDULE_ID });
  });

  it("does not expose a bulk delete on the collection", async () => {
    const res = await request(app).delete(`${BASE}/`);

    expect(res.status).toBe(404);
  });
});
