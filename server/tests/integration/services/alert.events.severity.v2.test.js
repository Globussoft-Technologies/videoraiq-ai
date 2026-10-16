/**
 * End to end through triggerAlertOnIncident (v2): which addresses an incident's
 * email actually goes to: verified recipients selected on the detection (whose
 * Detection Types allow it) or subscribed to its type, narrowed by their
 * per-detection severities (recipients.severityByType). Mail / WhatsApp /
 * Telegram are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";

const mail = vi.hoisted(() => ({ calls: [] }));
// Any MailResponse.<type>(emails, ...) call is recorded; never thenable.
const recorder = vi.hoisted(() => (record) => new Proxy({}, {
  get: (_, name) => (name === "then" ? undefined : (...args) => { record?.(name, args); return Promise.resolve(); }),
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: recorder((name, args) => mail.calls.push([name, args[0]])),
}));
vi.mock("../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js", () => ({
  sendIncidentWhatsApp: () => Promise.resolve(),
}));
vi.mock("../../../services/telegram.service.js", () => ({ default: recorder() }));

const { triggerAlertOnIncident } = await import("../../../core/v2/alerts/alert.events.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: Recipient } = await import("../../../core/v2/verifyRecipients/recipients.model.js");
const { CrowdDetectionSetting, PersonalProtectiveEquipmentSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { CroudIncident, SafetyHelmetIncident } = await import("../../../core/v2/incidents/incidents.model.js");

let admin;
let nvr;
let channel;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({ user_id: "sev-user", login: "sev-user", email: "sev@test.com" });
  nvr = await NVR.create({
    userId: admin.user_id, nvrName: "NVR", brand: "hikvision", domain: "http://nvr.test", location: "site", localNvrId: "sev-nvr",
  });
  const recipient = (value, extra) => Recipient.create({ adminId: admin._id, type: "email", value, verified: true, ...extra });
  const crowdTicked = await Promise.all([
    recipient("any@x.com", { incidentTypes: ["crowdDetection"] }),
    recipient("high@x.com", { incidentTypes: ["crowdDetection"], severityByType: { crowdDetection: ["high"] } }),
    recipient("low@x.com", { incidentTypes: ["crowdDetection"], severityByType: { crowdDetection: ["low"] } }),
    recipient("noTypes@x.com"),
    recipient("unverified@x.com", { incidentTypes: ["crowdDetection"], verified: false }),
    recipient("ppeOnly@x.com", { incidentTypes: ["personalProtectiveEquipment"] }),
  ]);
  // Subscribed to crowd but selected nowhere: emailed through the subscription.
  await recipient("subscribedOnly@x.com", { incidentTypes: ["crowdDetection"] });
  // Saved by the old form with the misspelt PPE key.
  const oldPpe = await recipient("oldPpe@x.com", { incidentTypes: ["personProtectiveEquipment"] });

  // Detection importance "high": used when an incident arrives without a severity.
  const crowd = await CrowdDetectionSetting.create({
    userId: admin.user_id, settingType: "crowdDetectionSettings", name: "Crowd", enabled: true,
    settings: { levelOfImportance: "high" }, alerts: crowdTicked.map((r) => r._id),
  });
  const ppe = await PersonalProtectiveEquipmentSetting.create({
    userId: admin.user_id, settingType: "personalProtectiveEquipmentSettings", name: "PPE", enabled: true,
    settings: { levelOfImportance: "moderate" }, alerts: [oldPpe._id],
  });
  channel = await Channel.create({
    userId: admin.user_id, nvrId: nvr._id, localChannelId: "1", name: "Cam", streamingPath: "/s", isAdded: true,
    detections: {
      crowdDetectionSettings: { id: crowd._id, enabled: true },
      personalProtectiveEquipmentSettings: { id: ppe._id, enabled: true },
    },
  });
});

const emailedFor = async (Model, detectionType, severity) => {
  mail.calls = [];
  const saved = await Model.create({
    userId: admin.user_id, nvrId: nvr._id, channelId: channel._id, timeOfIncident: new Date(), ...(severity ? { severity } : {}),
  });
  await triggerAlertOnIncident({ detectionType, nvrId: nvr._id, channelId: channel._id, saved: saved.toObject(), adminId: String(admin._id) });
  return [...(mail.calls[0]?.[1] || [])].sort();
};

describe("who gets a crowd alert", () => {
  it("emails verified subscribers even when not selected; skips unverified ones and selected people without this type", async () => {
    const emailed = await emailedFor(CroudIncident, "crowdDetection", "high");
    expect(emailed).toContain("subscribedOnly@x.com");
    for (const skipped of ["unverified@x.com", "ppeOnly@x.com"]) {
      expect(emailed).not.toContain(skipped);
    }
  });

  it("a ticked recipient with no Detection Types gets every type", async () => {
    expect(await emailedFor(CroudIncident, "crowdDetection", "low")).toContain("noTypes@x.com");
  });
});

describe("severity per detection narrows both ways", () => {
  it("a high crowd incident emails unrestricted and high-only recipients", async () => {
    expect(await emailedFor(CroudIncident, "crowdDetection", "high")).toEqual(["any@x.com", "high@x.com", "noTypes@x.com", "subscribedOnly@x.com"]);
  });

  it("a low crowd incident emails unrestricted and low-only recipients", async () => {
    expect(await emailedFor(CroudIncident, "crowdDetection", "low")).toEqual(["any@x.com", "low@x.com", "noTypes@x.com", "subscribedOnly@x.com"]);
  });

  it("an incident without a severity uses the detection's level of importance", async () => {
    expect(await emailedFor(CroudIncident, "crowdDetection", null)).toEqual(["any@x.com", "high@x.com", "noTypes@x.com", "subscribedOnly@x.com"]);
  });

  it("a PPE incident reaches the old-key recipient and the PPE subscriber selected only on crowd", async () => {
    expect(await emailedFor(SafetyHelmetIncident, "personalProtectiveEquipment", "moderate")).toEqual(["oldPpe@x.com", "ppeOnly@x.com"]);
  });
});
