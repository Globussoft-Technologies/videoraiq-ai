import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp } from "firebase-admin/app";

const { sendEachForMulticast, find, deleteMany, findById, logger } = vi.hoisted(() => ({
  sendEachForMulticast: vi.fn(),
  find: vi.fn(),
  deleteMany: vi.fn(),
  findById: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("firebase-admin/app", () => ({ initializeApp: vi.fn(() => ({})), cert: vi.fn((x) => x) }));
vi.mock("firebase-admin/messaging", () => ({ getMessaging: vi.fn(() => ({ sendEachForMulticast })) }));
vi.mock("../../../core/v2/pushTokens/pushTokens.model.js", () => ({ default: { find, deleteMany } }));
vi.mock("../../../core/v2/NVR/nvr.model.js", () => ({ default: { findById } }));
vi.mock("../../../utils/logger.js", () => ({ default: logger }));

const nvrDoc = (doc) => ({ select: () => ({ lean: () => Promise.resolve(doc) }) });

const tokensFor = (...tokens) => ({ select: () => ({ lean: async () => tokens.map((token) => ({ token, platform: "ios" })) }) });
const originalFirebasePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const serviceAccountFile = path.join(os.tmpdir(), `push-test-sa-${process.pid}.json`);
afterAll(() => {
  if (originalFirebasePath === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  else process.env.FIREBASE_SERVICE_ACCOUNT_PATH = originalFirebasePath;
  fs.rmSync(serviceAccountFile, { force: true });
});

// push.service caches its Firebase client at module level, so each test
// imports a fresh copy after setting (or clearing) the credentials path.
async function loadPush(configured) {
  vi.resetModules();
  if (configured) {
    const file = serviceAccountFile;
    fs.writeFileSync(file, JSON.stringify({ project_id: "test-project" }));
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = file;
  } else {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  }
  return import("../../../services/push.service.js");
}

const incident = {
  _id: "abc123",
  incidentType: "loiteringDetection",
  channelId: "ch1",
  nvrId: "nvr1",
  channelName: "F WING PANTRY",
  timeOfIncident: "2026-09-24T11:17:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockReturnValue(nvrDoc({ nvrName: "Pride Honda", location: "india" }));
});

describe("Firebase startup diagnostics", () => {
  it("initializes at startup once and identifies the configured project without sending a push", async () => {
    const { initializePushMessaging } = await loadPush(true);
    expect(initializePushMessaging()).toBe(true);
    expect(initializePushMessaging()).toBe(true);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("[PUSH] Firebase messaging ready (project test-project)");
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
  it("reports missing Firebase configuration at startup", async () => {
    const { initializePushMessaging } = await loadPush(false);
    expect(initializePushMessaging()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[PUSH] Firebase not configured"));
    expect(initializeApp).not.toHaveBeenCalled();
  });
  it("logs invalid service-account JSON without echoing file contents and keeps incident creation usable", async () => {
    const { initializePushMessaging, sendIncidentPush } = await loadPush(true);
    fs.writeFileSync(serviceAccountFile, '{"private_key":"private-key-fixture" broken');
    expect(initializePushMessaging()).toBe(false);
    await expect(sendIncidentPush({ admin: { _id: "a1" }, incident })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("[PUSH] Firebase init failed"), expect.objectContaining({ name: "SyntaxError" }));
    expect(logger.warn).toHaveBeenCalledWith("[PUSH] incident skipped", { adminId: "a1", incidentId: "abc123", reason: "firebase_unavailable" });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("private-key-fixture");
    expect(find).not.toHaveBeenCalled();
  });
  it("identifies a missing service-account file without stopping startup", async () => {
    const { initializePushMessaging } = await loadPush(true);
    fs.rmSync(serviceAccountFile);
    expect(initializePushMessaging()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("[PUSH] Firebase init failed"), expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("buildIncidentMessage", () => {
  it("builds per-platform payloads: sound on Android/iOS, data-only for web", async () => {
    const { buildIncidentMessage, ANDROID_CHANNEL_ID } = await loadPush(false);
    const msg = buildIncidentMessage(incident, "Asia/Kolkata");

    expect(msg.data.title).toBe("Loitering Detection");
    // No severity/detail/NVR known: camera line, then date + time.
    expect(msg.data.body).toMatch(/^F WING PANTRY\n24 Sept?, 04:47:00\s?pm$/i);
    expect(msg.data.image).toBeUndefined(); // no snapshot -> no image key at all
    expect(Object.values(msg.data).every((v) => typeof v === "string")).toBe(true); // FCM requirement
    expect(msg.android.notification).toMatchObject({ channelId: ANDROID_CHANNEL_ID, sound: "default" });
    expect(msg.apns.payload.aps).toMatchObject({ sound: "default", alert: { title: "Loitering Detection" } });
    expect(msg.webpush.headers.Urgency).toBe("high");
    // No top-level notification — otherwise the web SDK would auto-display a second copy.
    expect(msg.notification).toBeUndefined();
  });

  it("adds severity, the type-specific detail, NVR/site and the snapshot", async () => {
    const { buildIncidentMessage } = await loadPush(false);
    const snapshot = "https://media.example.com/crowd.jpg";
    const crowd = { ...incident, incidentType: "crowdDetection", severity: "moderate", croudCount: 3, zone: "Gate", Image: snapshot };
    const msg = buildIncidentMessage(crowd, "Asia/Kolkata", { nvrName: "Pride Honda", location: "india" });

    const [summary, where] = msg.data.body.split("\n");
    expect(summary).toBe("Medium · 3 people · Zone Gate");
    expect(where).toBe("F WING PANTRY · Pride Honda, india");
    expect(msg.data.image).toBe(snapshot);
    expect(msg.android.notification.imageUrl).toBe(snapshot);
    expect(msg.apns.fcmOptions.imageUrl).toBe(snapshot);

    const vehicle = buildIncidentMessage({ ...incident, vehicleNumber: "TS09FA2298", checkin: false });
    expect(vehicle.data.body.split("\n")[0]).toBe("Vehicle TS09FA2298 · OUT");
  });

  it("prefers the user-configured detection setting name", async () => {
    const { buildIncidentMessage } = await loadPush(false);
    const msg = buildIncidentMessage({ ...incident, detectionSetting: { name: "Pantry loitering" } });
    expect(msg.data.title).toBe("Pantry loitering");
  });
});

describe("sendIncidentPush", () => {
  it("logs a skipped incident when Firebase is not configured", async () => {
    const { sendIncidentPush } = await loadPush(false);
    await expect(sendIncidentPush({ admin: { _id: "a1" }, incident })).resolves.toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("[PUSH] incident skipped", { incidentId: "abc123", adminId: "a1", reason: "firebase_unavailable" });
  });

  it("sends nothing when the admin turned push alerts off", async () => {
    const { sendIncidentPush } = await loadPush(true);
    await sendIncidentPush({ admin: { _id: "a1", pushAlertsEnabled: false }, incident });
    expect(find).not.toHaveBeenCalled();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("[PUSH] incident skipped", { incidentId: "abc123", adminId: "a1", reason: "admin_push_disabled" });
  });

  it("logs a missing incident owner without querying devices or sending", async () => {
    const { sendIncidentPush } = await loadPush(true);
    await sendIncidentPush({ admin: null, incident });
    expect(logger.warn).toHaveBeenCalledWith("[PUSH] incident skipped", { incidentId: "abc123", adminId: null, reason: "missing_admin" });
    expect(find).not.toHaveBeenCalled();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("logs when the incident owner has no registered devices", async () => {
    const { sendIncidentPush } = await loadPush(true);
    find.mockReturnValue(tokensFor());
    await sendIncidentPush({ admin: { _id: "a1" }, incident });
    expect(logger.info).toHaveBeenCalledWith("[PUSH] incident skipped", { incidentId: "abc123", adminId: "a1", reason: "no_registered_tokens" });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends to every device of the admin and deletes dead tokens", async () => {
    const { sendIncidentPush } = await loadPush(true);
    find.mockReturnValue(tokensFor("good-token", "dead-token", "flaky-token"));
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: false, error: { code: "messaging/internal-error", message: "try later" } },
      ],
    });

    await sendIncidentPush({ admin: { _id: "a1", timezone: "Asia/Kolkata" }, incident });

    expect(find).toHaveBeenCalledWith({ adminId: "a1" });
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual(["good-token", "dead-token", "flaky-token"]);
    expect(findById).toHaveBeenCalledWith("nvr1");
    expect(sendEachForMulticast.mock.calls[0][0].data.body).toContain("Pride Honda, india");
    // Only the unregistered token is removed; a transient error keeps the token.
    expect(deleteMany).toHaveBeenCalledWith({ token: { $in: ["dead-token"] } });
    expect(logger.warn).toHaveBeenCalledWith("[PUSH] send failed (messaging/registration-token-not-registered)", expect.objectContaining({ platform: "ios", stale: true }));
    expect(logger.info).toHaveBeenCalledWith("[PUSH] incident abc123 -> 1/3 devices, 1 stale removed");
    expect(JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls])).not.toMatch(/good-token|dead-token|flaky-token/);
  });

  it("logs an iOS APNs authentication failure with incident context and keeps its token", async () => {
    const { sendIncidentPush } = await loadPush(true);
    find.mockReturnValue(tokensFor("private-ios-token"));
    sendEachForMulticast.mockResolvedValue({ successCount: 0, responses: [{ success: false, error: { code: "messaging/third-party-auth-error", message: "private-ios-token" } }] });
    await sendIncidentPush({ admin: { _id: "a1" }, incident });
    expect(logger.warn).toHaveBeenCalledWith("[PUSH] send failed (messaging/third-party-auth-error)", { incidentId: "abc123", adminId: "a1", platform: "ios", stale: false });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private-ios-token");
  });

  it("never throws when FCM itself fails", async () => {
    const { sendIncidentPush } = await loadPush(true);
    find.mockReturnValue(tokensFor("t1"));
    sendEachForMulticast.mockRejectedValue(Object.assign(new Error("private-device-token"), { code: "messaging/server-unavailable" }));
    await expect(sendIncidentPush({ admin: { _id: "a1" }, incident })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("[PUSH] incident push failed", expect.objectContaining({ code: "messaging/server-unavailable" }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("private-device-token");
  });
});
