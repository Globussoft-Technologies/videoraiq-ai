import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../core/v2/Auth/auth.service.js", () => ({
  default: {
    syncAmemberUserWebhook: vi.fn(async (req, res) =>
      res.status(201).json({
        ok: true,
        status: "created",
        received: req.body,
      }),
    ),
  },
}));

const { buildApp } = await import("../helpers/app.js");
const { default: amemberRoutes } = await import(
  "../../core/v2/integrations/amember.routes.js"
);

let app;
beforeEach(() => {
  app = buildApp((instance) =>
    instance.use("/api/v2/integrations/amember", amemberRoutes),
  );
});

describe("POST /api/v2/integrations/amember/users/sync", () => {
  it("dispatches the JSON event to the aMember synchronization handler", async () => {
    const body = {
      eventId: "evt-contract-1",
      event: "user.created",
      userId: 9281,
    };

    const response = await request(app)
      .post("/api/v2/integrations/amember/users/sync")
      .set("x-amember-timestamp", "1789727400")
      .set("x-amember-signature", `sha256=${"0".repeat(64)}`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ok: true, status: "created", received: body });
  });
});
