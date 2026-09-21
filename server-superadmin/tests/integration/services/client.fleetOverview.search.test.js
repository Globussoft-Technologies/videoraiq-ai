import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const { default: ClientService } = await import(
  "../../../core/v1/client/client.service.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");

beforeAll(async () => connectMongo());
afterAll(async () => disconnectMongo());
beforeEach(async () => {
  await clearCollections();
  vi.restoreAllMocks();
  vi.spyOn(ClientService, "_getLatestInvoiceName").mockResolvedValue("Test Plan");
  vi.spyOn(ClientService, "_getSubscriptionStatus").mockResolvedValue({
    expireDate: null,
    status: "active",
  });
});

const makeAdmin = (overrides) => Admin.create({
  user_id: overrides.user_id,
  login: overrides.login,
  email: overrides.email,
  name_f: overrides.name_f,
  name_l: overrides.name_l,
  purchasedCameras: overrides.purchasedCameras || 0,
});

describe("client fleet overview camera-utilisation search", () => {
  it("filters by req.query.search without changing fleet-wide totals", async () => {
    await Promise.all([
      makeAdmin({
        user_id: "101",
        login: "pavank",
        email: "pavan.kumar@example.com",
        name_f: "Pavan",
        name_l: "Kumar",
        purchasedCameras: 50,
      }),
      makeAdmin({
        user_id: "102",
        login: "aishwarya",
        email: "aishwarya@example.com",
        name_f: "Aishwarya",
        name_l: "M",
        purchasedCameras: 16,
      }),
    ]);
    const { req, res } = serviceCtx({ query: { search: "Pavan Kumar" } });

    await ClientService.fleetOverview(req, res);

    const data = payload(res).data;
    expect(data.totals.clients).toBe(2);
    expect(data.clientsByPlan).toEqual([{ plan: "Test Plan", clients: 2 }]);
    expect(data.cameraUtilisation).toHaveLength(1);
    expect(data.cameraUtilisation[0]).toMatchObject({
      name: "Pavan Kumar",
      licensed: 50,
    });
  });

  it("matches email case-insensitively and treats special characters literally", async () => {
    await makeAdmin({
      user_id: "103",
      login: "square-bracket",
      email: "ops+[camera]@example.com",
      name_f: "Camera",
      name_l: "Ops",
      purchasedCameras: 4,
    });
    const { req, res } = serviceCtx({ query: { search: "+[CAMERA]@" } });

    await ClientService.fleetOverview(req, res);

    expect(payload(res).data.cameraUtilisation).toEqual([
      expect.objectContaining({ name: "Camera Ops", licensed: 4 }),
    ]);
  });
});
