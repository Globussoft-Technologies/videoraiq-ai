import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  getCarModelVehicleNumbers: vi.fn(),
  getCylinderDetectionLogs: vi.fn(),
}));

vi.mock("../../core/v2/incidents/incidents.service.js", () => ({
  default: new Proxy(mocks, {
    get(target, property) {
      if (property in target) return target[property];
      return vi.fn();
    },
  }),
}));

vi.mock("../../middlewares/permissionMiddleware.js", () => ({
  viewAccessCheck: (req, res, next) => next(),
  editAccessCheck: (req, res, next) => next(),
  createAccessCheck: (req, res, next) => next(),
  deleteAccessCheck: (req, res, next) => next(),
}));

const { buildApp } = await import("../helpers/app.js");
const { default: incidentsRoutes } = await import(
  "../../core/v2/incidents/incidents.routes.js"
);

const app = buildApp((instance) => {
  instance.use("/api/v2/incidents", incidentsRoutes);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCarModelVehicleNumbers.mockImplementation((req, res) =>
    res.status(200).json({
      status: "success",
      data: { totalCount: 0, vehicleNumbers: [] },
    }),
  );
  mocks.getCylinderDetectionLogs.mockImplementation((req, res) =>
    res.status(200).json({ status: "success", data: { totalCount: 0, data: [] } }),
  );
});

describe("POST /api/v2/incidents/logs/cylinder-detection", () => {
  it("routes the request to the cylinder log handler", async () => {
    const response = await request(app).post(
      "/api/v2/incidents/logs/cylinder-detection",
    );

    expect(response.status).toBe(200);
    expect(mocks.getCylinderDetectionLogs).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/v2/incidents/logs/car-model-detection/numbers", () => {
  it("routes the request to the car-model vehicle-number handler", async () => {
    const response = await request(app).get(
      "/api/v2/incidents/logs/car-model-detection/numbers",
    );

    expect(response.status).toBe(200);
    expect(mocks.getCarModelVehicleNumbers).toHaveBeenCalledTimes(1);
  });
});
