import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../core/v2/alerts/alerts.model.js", () => ({ default: {} }));
vi.mock("../../../core/v2/NVR/nvr.model.js", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("../../../core/v2/channels/channels.model.js", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("../../../core/v2/verifyRecipients/recipients.model.js", () => ({
  default: { find: vi.fn() },
}));
vi.mock("../../../core/v2/incidents/incidents.model.js", () => ({
  Incident: { findOne: vi.fn() },
}));
vi.mock("../../../core/v2/admin/admin.model.js", () => ({
  default: {
    findOne: vi.fn(() => ({
      select: () => ({
        lean: async () => ({
          _id: "admin-1",
          timezone: "UTC",
          emailAlertsEnabled: true,
          telegramAlertsEnabled: true,
        }),
      }),
    })),
  },
}));
vi.mock("../../../mailService/mail.helper.js", () => ({
  default: { cylinderDetection: vi.fn().mockResolvedValue("sent") },
}));
vi.mock(
  "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js",
  () => ({ sendIncidentWhatsApp: vi.fn().mockResolvedValue([]) }),
);
vi.mock("../../../services/telegram.service.js", () => ({
  default: { sendIncident: vi.fn().mockResolvedValue(undefined) },
}));

const { triggerAlertOnIncident } = await import(
  "../../../core/v2/alerts/alert.events.js"
);
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Recipient } = await import(
  "../../../core/v2/verifyRecipients/recipients.model.js"
);
const { Incident } = await import("../../../core/v2/incidents/incidents.model.js");
const { default: MailResponse } = await import("../../../mailService/mail.helper.js");
const { sendIncidentWhatsApp } = await import(
  "../../../messagingService/IncidentsWhatsAppFunction/whatsapp.incidentsFunction.js"
);
const { default: TelegramService } = await import("../../../services/telegram.service.js");

const queryResult = (value) => ({
  select: () => ({ lean: async () => value }),
});

beforeEach(() => vi.clearAllMocks());

describe("v2 cylinder incident alerts", () => {
  it("fans out email, WhatsApp, and Telegram alerts", async () => {
    Channel.findOne
      .mockReturnValueOnce({
        populate: () => ({
          lean: async () => ({
            _id: "channel-1",
            name: "Cylinder Camera",
            detections: { cylinderDetectionSettings: true },
          }),
        }),
      })
      .mockReturnValueOnce({
        populate: () => ({
          lean: async () => ({
            detections: {
              cylinderDetectionSettings: {
                id: {
                  name: "Cylinder Area 1",
                  alerts: ["email-1", "phone-1"],
                  settings: { telegramChatIds: ["chat-1"] },
                },
              },
            },
          }),
        }),
      });
    NVR.findOne.mockResolvedValue({ _id: "nvr-1", nvrName: "NVR 1" });
    Incident.findOne.mockReturnValue({
      populate: () => ({
        lean: async () => ({
          _id: "incident-1",
          incidentType: "cylinderDetection",
          timeOfIncident: new Date("2026-09-15T10:00:00.000Z"),
        }),
      }),
    });
    Recipient.find
      .mockReturnValueOnce(queryResult([{ value: "alerts@example.com" }]))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([{ value: "+919999999999" }]));

    await triggerAlertOnIncident({
      detectionType: "cylinderDetection",
      nvrId: "nvr-1",
      channelId: "channel-1",
      saved: { _id: "incident-1" },
      adminId: "admin-1",
    });

    expect(MailResponse.cylinderDetection).toHaveBeenCalledWith(
      ["alerts@example.com"],
      expect.objectContaining({ incidentName: "Cylinder Area 1" }),
      "cylinderDetection",
      expect.anything(),
      expect.anything(),
      "UTC",
    );
    expect(sendIncidentWhatsApp).toHaveBeenCalledWith(
      expect.anything(),
      ["+919999999999"],
      expect.anything(),
      expect.anything(),
      "UTC",
    );
    expect(TelegramService.sendIncident).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "admin-1",
      "UTC",
      { preferredChatIds: ["chat-1"] },
    );
  });
});
