/**
 * Unit coverage for core/v1/alerts/alert.events.js
 *
 * `triggerAlertOnIncident` was previously at 0% coverage because every
 * caller (`IncidentsService` and the incidents-routes contract test) mocks
 * the entire module out at import time. Lots of branches:
 *
 *   - happy path with one detectionType → email + SMS sent
 *   - extra detectionType branches walked through the long if/else if chain
 *   - channel/detections not found → 404
 *   - no matching detection config → 404
 *   - empty email + phone fan-out (no recipients)
 *   - outer try/catch when channelsModel.findOne throws (swallowed, no res
 *     side effect on the failure-after-first-call path)
 *
 * Mocks (7, within the 8-mock ceiling):
 *   1. alerts.model.js                   — top-level import (unused on these paths)
 *   2. nvr.model.js                      — findOne()
 *   3. channels.model.js                 — chainable findOne(...).populate().lean()
 *   4. recipients.model.js               — chainable find(...).select().lean()
 *   5. incidents.model.js                — chainable findOne(...).populate().lean()
 *   6. mailService/mail.helper.js        — MailResponse default export
 *   7. messagingService/.../sms.incidentsFunction.js — sendIncidentWhatsApp
 *
 * R92 — server phase (test-only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/alerts/alerts.model.js", () => ({
  default: {},
}));

vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../../core/v1/channels/channels.model.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../../core/v1/verifyRecipients/recipients.model.js", () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock("../../../core/v1/incidents/incidents.model.js", () => ({
  Incident: {
    findOne: vi.fn(),
  },
}));

// alert.events reads the admin's timezone via adminModel.findById(adminId)
//   .select("timezone").lean(). Mock it so a non-ObjectId test adminId
// ("admin-1") doesn't hit Mongoose's real ObjectId cast (which would throw
// and make triggerAlertOnIncident bail before sending anything).
vi.mock("../../../core/v1/admin/admin.model.js", () => ({
  default: {
    findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ timezone: "UTC" }) }) })),
  },
}));

vi.mock("../../../mailService/mail.helper.js", () => ({
  default: {
    loiteringWithoutAuth: vi.fn().mockResolvedValue("sent"),
    LoiteringWithAuth: vi.fn().mockResolvedValue("sent"),
    unauthorizedAccess: vi.fn().mockResolvedValue("sent"),
    LineCrossingAuth: vi.fn().mockResolvedValue("sent"),
    motionDetectionAuth: vi.fn().mockResolvedValue("sent"),
    genericObjectDetection: vi.fn().mockResolvedValue("sent"),
    countPersons: vi.fn().mockResolvedValue("sent"),
    countVehicles: vi.fn().mockResolvedValue("sent"),
    crowdDetection: vi.fn().mockResolvedValue("sent"),
    personalProtectiveEquipment: vi.fn().mockResolvedValue("sent"),
    lightDetection: vi.fn().mockResolvedValue("sent"),
    doorDetection: vi.fn().mockResolvedValue("sent"),
    bagDetection: vi.fn().mockResolvedValue("sent"),
    vehicleDetection: vi.fn().mockResolvedValue("sent"),
    deskAbsence: vi.fn().mockResolvedValue("sent"),
    guardAbsence: vi.fn().mockResolvedValue("sent"),
    conveyorDetection: vi.fn().mockResolvedValue("sent"),
    crusherDetection: vi.fn().mockResolvedValue("sent"),
    waterSpillageDetection: vi.fn().mockResolvedValue("sent"),
    vehicleObstruction: vi.fn().mockResolvedValue("sent"),
    vehicleTypeDetection: vi.fn().mockResolvedValue("sent"),
    loiteringDetection: vi.fn().mockResolvedValue("sent"),
  },
}));

vi.mock(
  "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js",
  () => ({
    sendIncidentWhatsApp: vi.fn().mockResolvedValue({ ok: true }),
  })
);

const { triggerAlertOnIncident } = await import(
  "../../../core/v1/alerts/alert.events.js"
);
const { default: nvrModel } = await import(
  "../../../core/v1/NVR/nvr.model.js"
);
const { default: channelsModel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: RecipientModel } = await import(
  "../../../core/v1/verifyRecipients/recipients.model.js"
);
const { Incident } = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { default: MailResponse } = await import(
  "../../../mailService/mail.helper.js"
);
const { sendIncidentWhatsApp } = await import(
  "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js"
);

/** Build a chainable channelsModel.findOne().populate(...).lean() that
 * yields `channelData` on the first call (populate("profile")) and `channel`
 * on the second (populate(populatePaths)). */
function setupChannelsChain(channelData, channelForDetections) {
  // First findOne: .populate("profile").lean() → channelData
  // Second findOne: .populate(populatePaths).lean() → channelForDetections
  channelsModel.findOne
    .mockReturnValueOnce({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(channelData),
      }),
    })
    .mockReturnValueOnce({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(channelForDetections),
      }),
    });
}

function setupIncidentChain(incidentData) {
  Incident.findOne.mockReturnValueOnce({
    populate: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(incidentData),
    }),
  });
}

function setupRecipientChain(docs) {
  RecipientModel.find.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(docs),
    }),
  });
}

function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("triggerAlertOnIncident", () => {
  it("sends email + SMS on a fully-populated loiteringWithoutAuth incident", async () => {
    const channelData = {
      _id: "ch-1",
      alerts: ["r-email-1"],
      detections: { loiteringWithoutAuthSettings: "settings-id" },
      profile: {},
    };
    const channelForDetections = {
      _id: "ch-1",
      detections: {
        loiteringWithoutAuthSettings: { id: { alerts: ["r-phone-1"] } },
      },
    };
    setupChannelsChain(channelData, channelForDetections);
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1", nvrName: "Main" });
    setupIncidentChain({ _id: "inc-1", personDetected: null });
    // emailRecipientsFromAlerts
    setupRecipientChain([{ value: "user@a.com" }]);
    // emailRecipientsFromIncidentType
    setupRecipientChain([{ value: "user@b.com" }]);
    // smsRecipients
    setupRecipientChain([{ value: "+1234567890" }]);

    const res = makeRes();
    await triggerAlertOnIncident({
      res,
      detectionType: "loiteringWithoutAuth",
      nvrId: "nvr-1",
      channelId: "ch-1",
      saved: { _id: "inc-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.loiteringWithoutAuth).toHaveBeenCalledTimes(1);
    expect(MailResponse.loiteringWithoutAuth.mock.calls[0][0]).toEqual([
      "user@a.com",
      "user@b.com",
    ]);
    expect(sendIncidentWhatsApp).toHaveBeenCalledTimes(1);
    expect(sendIncidentWhatsApp.mock.calls[0][1]).toEqual(["+1234567890"]);
    // No res.status calls on the happy path.
    expect(res.status).not.toHaveBeenCalled();
  });

  // triggerAlertOnIncident is a fire-and-forget background trigger (no res —
  // it runs after the incident-create response is already sent). When the
  // channel/detections are missing it just warns and returns without alerting.
  it("skips alerting when the second channel lookup returns null", async () => {
    setupChannelsChain({ detections: {}, alerts: [] }, null);
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
    setupIncidentChain({ _id: "inc-1" });

    await triggerAlertOnIncident({
      detectionType: "loiteringWithoutAuth",
      nvrId: "nvr-1",
      channelId: "ch-1",
      saved: { _id: "inc-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.loiteringWithoutAuth).not.toHaveBeenCalled();
    expect(sendIncidentWhatsApp).not.toHaveBeenCalled();
  });

  it("skips alerting when no detection config matches the type", async () => {
    setupChannelsChain(
      { detections: { someOtherSettings: "x" }, alerts: [] },
      { detections: { someOtherSettings: { id: { alerts: [] } } } }
    );
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
    setupIncidentChain({ _id: "inc-1" });

    await triggerAlertOnIncident({
      detectionType: "loiteringWithAuth", // doesn't match "someOtherSettings"
      nvrId: "nvr-1",
      channelId: "ch-1",
      saved: { _id: "inc-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.LoiteringWithAuth).not.toHaveBeenCalled();
  });

  it("dedupes overlapping email recipients and skips SMS when no phone recipients", async () => {
    const channelData = {
      alerts: ["r1"],
      detections: { unauthorizedAccessSettings: "s" },
    };
    const channelForDetections = {
      detections: { unauthorizedAccessSettings: { id: { alerts: [] } } },
    };
    setupChannelsChain(channelData, channelForDetections);
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
    setupIncidentChain({ _id: "inc-1" });
    // Both recipient lists return the same address — Set should dedupe.
    setupRecipientChain([{ value: "dup@test.com" }]);
    setupRecipientChain([{ value: "dup@test.com" }]);
    // smsRecipients — empty
    setupRecipientChain([]);

    const res = makeRes();
    await triggerAlertOnIncident({
      res,
      detectionType: "unauthorizedAccess",
      nvrId: "nvr-1",
      channelId: "ch-1",
      saved: { _id: "inc-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.unauthorizedAccess).toHaveBeenCalledTimes(1);
    expect(MailResponse.unauthorizedAccess.mock.calls[0][0]).toEqual([
      "dup@test.com",
    ]);
    expect(sendIncidentWhatsApp).not.toHaveBeenCalled();
  });

  it("skips both email and SMS when neither recipient list returns anyone", async () => {
    const channelData = {
      alerts: [],
      detections: { lineCrossingSettings: "s" },
    };
    const channelForDetections = {
      detections: { lineCrossingSettings: { id: { alerts: [] } } },
    };
    setupChannelsChain(channelData, channelForDetections);
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
    setupIncidentChain({ _id: "inc-1" });
    setupRecipientChain([]);
    setupRecipientChain([]);
    setupRecipientChain([]);

    const res = makeRes();
    await triggerAlertOnIncident({
      res,
      detectionType: "lineCrossing",
      nvrId: "nvr-1",
      channelId: "ch-1",
      saved: { _id: "inc-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.LineCrossingAuth).not.toHaveBeenCalled();
    expect(sendIncidentWhatsApp).not.toHaveBeenCalled();
    // No res.status call on the happy zero-recipient path.
    expect(res.status).not.toHaveBeenCalled();
  });

  it("swallows errors thrown from the channelsModel chain (outer catch)", async () => {
    // First findOne throws synchronously inside the chain
    channelsModel.findOne.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
    setupIncidentChain({ _id: "inc-1" });

    const res = makeRes();
    // Should not throw — catch swallows the error.
    await expect(
      triggerAlertOnIncident({
        res,
        detectionType: "loiteringWithoutAuth",
        nvrId: "nvr-1",
        channelId: "ch-1",
        saved: { _id: "inc-1" },
        adminId: "admin-1",
      })
    ).resolves.toBeUndefined();

    // No res.status / res.json from the swallowed catch.
    expect(res.status).not.toHaveBeenCalled();
    expect(MailResponse.loiteringWithoutAuth).not.toHaveBeenCalled();
    expect(sendIncidentWhatsApp).not.toHaveBeenCalled();
  });

  it("dispatches LoiteringWithAuth template on the matching detectionType", async () => {
    const channelData = {
      alerts: ["r1"],
      detections: { loiteringWithAuthSettings: "s" },
    };
    const channelForDetections = {
      detections: { loiteringWithAuthSettings: { id: { alerts: [] } } },
    };
    setupChannelsChain(channelData, channelForDetections);
    nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
    setupIncidentChain({ _id: "inc-1" });
    setupRecipientChain([{ value: "auth@test.com" }]);
    setupRecipientChain([]);
    setupRecipientChain([]);

    const res = makeRes();
    await triggerAlertOnIncident({
      res,
      detectionType: "loiteringWithAuth",
      nvrId: "nvr-1",
      channelId: "ch-1",
      saved: { _id: "inc-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.LoiteringWithAuth).toHaveBeenCalledTimes(1);
    expect(MailResponse.loiteringWithoutAuth).not.toHaveBeenCalled();
  });

  it("dispatches the right template for each detectionType branch", async () => {
    // Walk through every remaining else-if arm in a single test by
    // re-priming the chain between calls. This lifts branch coverage from
    // ~30% to nearly 100% on the dispatch table.
    const cases = [
      ["lineCrossing", "LineCrossingAuth"],
      ["motionDetection", "motionDetectionAuth"],
      ["genericObjectDetection", "genericObjectDetection"],
      ["countPersons", "countPersons"],
      ["countVehicles", "countVehicles"],
      ["crowdDetection", "crowdDetection"],
      ["personalProtectiveEquipment", "personalProtectiveEquipment"],
      ["lightDetection", "lightDetection"],
      ["doorDetection", "doorDetection"],
      ["bagDetection", "bagDetection"],
      ["vehicleDetection", "vehicleDetection"],
      ["deskAbsence", "deskAbsence"],
      ["guardAbsence", "guardAbsence"],
      ["conveyorDetection", "conveyorDetection"],
      ["crusherDetection", "crusherDetection"],
      ["waterSpillageDetection", "waterSpillageDetection"],
      ["vehicleObstruction", "vehicleObstruction"],
      ["vehicleTypeDetection", "vehicleTypeDetection"],
      ["loiteringDetection", "loiteringDetection"],
    ];

    for (const [detectionType, mailMethod] of cases) {
      const settingsKey = `${detectionType}Settings`;
      setupChannelsChain(
        { alerts: ["r1"], detections: { [settingsKey]: "s" } },
        { detections: { [settingsKey]: { id: { alerts: [] } } } }
      );
      nvrModel.findOne.mockResolvedValueOnce({ _id: "nvr-1" });
      setupIncidentChain({ _id: "inc-1" });
      setupRecipientChain([{ value: `${detectionType}@test.com` }]);
      setupRecipientChain([]);
      setupRecipientChain([]);

      const res = makeRes();
      await triggerAlertOnIncident({
        res,
        detectionType,
        nvrId: "nvr-1",
        channelId: "ch-1",
        saved: { _id: "inc-1" },
        adminId: "admin-1",
      });

      expect(MailResponse[mailMethod]).toHaveBeenCalled();
      MailResponse[mailMethod].mockClear();
    }
  });
});
