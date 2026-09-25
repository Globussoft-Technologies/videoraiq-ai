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
const { default: UserSession } = await import(
  "../../../core/v2/sessions/sessions.model.js"
);
const { Incident } = await import(
  "../../../core/v2/incidents/incidents.model.js"
);
const { default: NVR } = await import(
  "../../../core/v2/NVR/nvr.model.js"
);
const { default: AuthorizedUser } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: MeasurementIncident } = await import(
  "../../../core/v2/measurementIncidents/measurementIncidents.model.js"
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

  it("rejects an unsupported static webhook action", async () => {
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(
      staticSecretRequest({ action: "archive", user_id: 103 }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({
      ok: false,
      message: "action must be sync, create, update or delete",
    });
  });

  it("hard-deletes the local admin and its generated support records", async () => {
    const admin = await Admin.create({
      user_id: "103",
      login: "authoritative-login",
      email: "authoritative@example.com",
    });
    const otherAdmin = await Admin.create({
      user_id: "104",
      login: "keep-me",
      email: "keep-me@example.com",
    });
    await DashboardSidebarConfig.create({
      adminId: admin._id,
      detectionConfigs: [],
    });
    await UserSession.create({
      sessionId: "session-to-delete",
      deviceId: "test-device",
      adminId: admin._id,
      userType: "admin",
    });
    await Incident.collection.insertMany([
      { userId: "103", timeOfIncident: new Date(), incidentType: "test-delete" },
      { userId: "104", timeOfIncident: new Date(), incidentType: "test-keep" },
    ]);
    await NVR.collection.insertMany([
      { userId: "103", name: "delete-nvr" },
      { userId: "104", name: "keep-nvr" },
    ]);
    await AuthorizedUser.collection.insertMany([
      { adminId: admin._id, firstName: "Delete" },
      { adminId: otherAdmin._id, firstName: "Keep" },
    ]);
    await MeasurementIncident.collection.insertMany([
      { adminId: String(admin._id), stationId: "delete-station" },
      { adminId: String(otherAdmin._id), stationId: "keep-station" },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(
      staticSecretRequest({
        action: "delete",
        user_id: 103,
        login: "untrusted-login",
        email: "untrusted@example.com",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      status: "deleted",
      adminId: admin._id,
      deletedRecords: {
        sessions: 1,
        incidents: 1,
        nvrs: 1,
        authorizedUsers: 1,
        measurementIncidents: 1,
        admins: 1,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await Admin.findById(admin._id)).toBeNull();
    expect(await DashboardSidebarConfig.countDocuments({ adminId: admin._id })).toBe(0);
    expect(await UserSession.countDocuments({ adminId: admin._id })).toBe(0);
    expect(await Incident.countDocuments({ userId: "103" })).toBe(0);
    expect(await NVR.countDocuments({ userId: "103" })).toBe(0);
    expect(await AuthorizedUser.countDocuments({ adminId: admin._id })).toBe(0);
    expect(await MeasurementIncident.countDocuments({ adminId: String(admin._id) })).toBe(0);

    expect(await Admin.findById(otherAdmin._id)).not.toBeNull();
    expect(await Incident.countDocuments({ userId: "104" })).toBe(1);
    expect(await NVR.countDocuments({ userId: "104" })).toBe(1);
    expect(await AuthorizedUser.countDocuments({ adminId: otherAdmin._id })).toBe(1);
    expect(await MeasurementIncident.countDocuments({ adminId: String(otherAdmin._id) })).toBe(1);

    const retryRes = responseRecorder();
    await AUTHService.syncAmemberUserWebhook(
      staticSecretRequest({ action: "delete", user_id: 103 }),
      retryRes,
    );
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.payload).toEqual({
      ok: true,
      status: "already_deleted",
      adminId: null,
      deletedRecords: {},
    });
  });

  it("accepts a signed user.deleted event and records it for replay protection", async () => {
    const admin = await Admin.create({
      user_id: "9281",
      login: "delete-me",
      email: "delete-me@example.com",
    });
    vi.stubGlobal("fetch", vi.fn());
    const req = signedRequest({
      eventId: "evt-user-9281-deleted",
      event: "user.deleted",
      userId: 9281,
    });
    const res = responseRecorder();

    await AUTHService.syncAmemberUserWebhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, status: "deleted" });
    expect(await Admin.findById(admin._id)).toBeNull();
    expect(await AmemberWebhookEvent.findOne({ eventId: req.body.eventId }))
      .toMatchObject({ event: "user.deleted", userId: "9281" });
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
