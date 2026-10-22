/**
 * Camera tampering (DS's 2026-10-22 rename of blurred camera). DS posts
 * incidentType "cameraTamperingDetection" with a tamperType; it is stored as
 * our blurredCameraDetection and now emails its recipients (it had no email
 * branch). Runs createIncidents through the real alert pipeline; mail,
 * WhatsApp, Telegram and socket are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

const mail = vi.hoisted(() => ({ calls: [] }));
const recorder = vi.hoisted(() => (record) => new Proxy({}, {
  get: (_, name) => (name === "then" ? undefined : (...args) => { record?.(name, args); return Promise.resolve(); }),
}));
vi.mock("../../../mailService/mail.helper.js", () => ({ default: recorder((name, args) => mail.calls.push([name, args[0]])) }));
vi.mock("../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js", () => ({ sendIncidentWhatsApp: () => Promise.resolve() }));
vi.mock("../../../services/telegram.service.js", () => ({ default: recorder() }));
vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn().mockResolvedValue(undefined) }));

const { default: IncidentsService } = await import("../../../core/v2/incidents/incidents.service.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: Recipient } = await import("../../../core/v2/verifyRecipients/recipients.model.js");
const { BlurredCameraDetectionSetting } = await import("../../../core/v2/detectionSettings/detectionSettings.model.js");
const { BlurredCameraDetectionIncident } = await import("../../../core/v2/incidents/incidents.model.js");

let admin;
let nvr;
let channel;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  mail.calls = [];
  admin = await Admin.create({ user_id: "tamper-u", login: "tamper-u", email: "tamper@test.com" });
  nvr = await NVR.create({ userId: "tamper-u", nvrName: "NVR", brand: "hikvision", domain: "http://nvr.test", location: "HQ", localNvrId: "tamper-nvr" });
  const recipient = await Recipient.create({ adminId: admin._id, type: "email", value: "guard@x.com", verified: true });
  const setting = await BlurredCameraDetectionSetting.create({
    userId: "tamper-u", settingType: "blurredCameraDetectionSettings", name: "Camera Tampering - Gate", enabled: true,
    settings: { levelOfImportance: "high" }, alerts: [recipient._id],
  });
  channel = await Channel.create({
    nvrId: nvr._id, userId: "tamper-u", streamingPath: "/s", localChannelId: "1", name: "Gate", isAdded: true,
    detections: { blurredCameraDetectionSettings: { id: setting._id, enabled: true } },
  });
});

// DS's incident payload, as sent (example: covered).
const dsPayload = (extra = {}) => ({
  incidentType: "cameraTamperingDetection", timeOfIncident: "2026-10-21T12:30:45Z", videoLink: "",
  description: "Camera view is covered or blocked.", incidentName: "Camera Covered", tamperType: "covered",
  cameraId: String(channel._id), nvrId: String(nvr._id), channelId: String(channel._id),
  Image: "uploads/camera_tampering.jpg", zone: "", type: "gauge", severity: "high", alertThreshold: 80,
  triggerNotification: true, adminId: String(admin._id), count: 1,
  ...extra,
});
const send = async (body) => {
  const { req, res, next } = serviceCtx({ body });
  await IncidentsService.createIncidents(req, res, next);
  return payload(res);
};

describe("camera tampering incidents (v2)", () => {
  it("DS's new payload is stored as our blurred-camera incident with its tamper type, and emails", async () => {
    await send(dsPayload());
    const [incident] = await BlurredCameraDetectionIncident.find().lean();
    expect(incident).toMatchObject({ incidentType: "blurredCameraDetection", tamperType: "covered", incidentName: "Camera Covered", alertThreshold: 80 });
    await vi.waitFor(() => expect(mail.calls).toHaveLength(1));
    expect(mail.calls[0]).toEqual(["industrialDetection", ["guard@x.com"]]);
  });

  it("still accepts the old blurredCameraDetection payload", async () => {
    await send(dsPayload({ incidentType: "blurredCameraDetection", tamperType: undefined, isBlurred: true }));
    expect(await BlurredCameraDetectionIncident.countDocuments({ isBlurred: true })).toBe(1);
    await vi.waitFor(() => expect(mail.calls).toHaveLength(1));
  });
});
