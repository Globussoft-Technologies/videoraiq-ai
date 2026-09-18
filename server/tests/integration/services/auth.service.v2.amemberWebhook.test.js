import { createHmac } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";

const { default: AUTHService } = await import(
  "../../../core/v2/Auth/auth.service.js"
);
const { default: Admin } = await import(
  "../../../core/v2/admin/admin.model.js"
);
const { default: DashboardSidebarConfig } = await import(
  "../../../core/v2/dashboard/dashboardSidebar.model.js"
);
const { default: AmemberWebhookEvent } = await import(
  "../../../core/v2/Auth/amemberWebhookEvent.model.js"
);
const { default: logger } = await import("../../../utils/logger.js");

const SECRET = "test-amember-webhook-secret";

function signedRequest(body, timestamp = Math.floor(Date.now() / 1000)) {
  const canonical = `${timestamp}.${body.eventId}.${body.event}.${body.userId}`;
  const signature = createHmac("sha256", SECRET)
    .update(canonical)
    .digest("hex");
  const headers = {
    "x-amember-timestamp": String(timestamp),
    "x-amember-signature": `sha256=${signature}`,
  };
  return {
    body,
    get(name) {
      return headers[String(name).toLowerCase()];
    },
  };
}

function staticSecretRequest(body, secret = SECRET) {
  return {
    body,
    ip: "127.0.0.1",
    get(name) {
      return String(name).toLowerCase() === "x-amember-webhook-secret"
        ? secret
        : undefined;
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("v2 aMember provisioning webhook", () => {
  it("accepts aMember's static-secret header and snake_case payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [{
        user_id: 103,
        login: "authoritative-login",
        email: "authoritative@example.com",
        name_f: "A",
        name_l: "Member",
      }],
    })));
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(
      staticSecretRequest({
        user_id: 103,
        login: "ignored-login",
        email: "ignored@example.com",
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({ ok: true, status: "created" });
    expect(await Admin.findOne({ user_id: "103" })).toMatchObject({
      login: "authoritative-login",
      email: "authoritative@example.com",
    });
    expect(await AmemberWebhookEvent.countDocuments()).toBe(0);
  });

  it("rejects an invalid static webhook secret", async () => {
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(
      staticSecretRequest({ user_id: 103 }, "wrong-secret"),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.message).toBe("Invalid aMember webhook secret");
  });

  it("fetches the authoritative aMember profile and provisions the local admin", async () => {
    const success = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{
        user_id: 9281,
        login: "new-customer",
        email: "customer@example.com",
        name_f: "New",
        name_l: "Customer",
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const req = signedRequest({
      eventId: "evt-user-9281-created",
      event: "user.created",
      userId: 9281,
    });
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({ ok: true, status: "created" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("_filter%5Buser_id%5D=9281");

    const admin = await Admin.findOne({ user_id: "9281" });
    expect(admin).toMatchObject({
      login: "new-customer",
      email: "customer@example.com",
      name_f: "New",
      name_l: "Customer",
    });
    expect(await DashboardSidebarConfig.countDocuments({ adminId: admin._id })).toBe(1);
    expect(await AmemberWebhookEvent.countDocuments({ eventId: req.body.eventId })).toBe(1);
    expect(success).toHaveBeenCalledWith(
      expect.stringContaining(
        "[AMEMBER_WEBHOOK_SYNCED] status=created " +
        "eventId=evt-user-9281-created event=user.created userId=9281",
      ),
    );
  });

  it("returns the saved result for a replay without calling aMember again", async () => {
    const admin = await Admin.create({
      user_id: "9281",
      login: "existing-customer",
      email: "existing@example.com",
    });
    await AmemberWebhookEvent.create({
      eventId: "evt-replayed",
      event: "user.created",
      userId: "9281",
      adminId: admin._id,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(
      signedRequest({
        eventId: "evt-replayed",
        event: "user.created",
        userId: 9281,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, status: "already_synchronized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before reading the database", async () => {
    const warning = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const req = signedRequest({
      eventId: "evt-invalid-signature",
      event: "user.created",
      userId: 9281,
    });
    const timestamp = req.get("x-amember-timestamp");
    req.get = (name) => {
      const header = name.toLowerCase();
      if (header === "x-amember-timestamp") return timestamp;
      if (header === "x-amember-signature") return `sha256=${"0".repeat(64)}`;
      return undefined;
    };
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({
      ok: false,
      message: "Invalid aMember webhook signature",
    });
    expect(warning).toHaveBeenCalledOnce();
    const logged = warning.mock.calls[0][0];
    expect(logged).toContain("[AMEMBER_WEBHOOK_FAILED]");
    expect(logged).toContain("stage=verification");
    expect(logged).toContain("status=401");
    expect(logged).toContain("eventId=evt-invalid-signature");
    expect(logged).not.toContain(req.get("x-amember-signature"));
  });

  it("logs aMember lookup failures with searchable event context", async () => {
    const failure = vi.spyOn(logger, "error").mockImplementation(() => logger);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(
      signedRequest({
        eventId: "evt-amember-unavailable",
        event: "user.created",
        userId: 9281,
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(failure).toHaveBeenCalledOnce();
    expect(failure.mock.calls[0][0]).toContain(
      "[AMEMBER_WEBHOOK_FAILED] stage=amember_user_lookup status=503 " +
      "eventId=evt-amember-unavailable event=user.created userId=9281",
    );
  });

  it("rejects a correctly signed event with a stale timestamp", async () => {
    const res = responseRecorder();
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301;

    await AUTHService.syncAmemberUserWebhook(
      signedRequest({
        eventId: "evt-stale",
        event: "user.created",
        userId: 9281,
      }, staleTimestamp),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.message).toBe("Expired aMember webhook timestamp");
  });
});
