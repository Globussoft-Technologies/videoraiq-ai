/**
 * ConfidenceScoreInPercentage surfaces in all three alert channels
 * (WhatsApp / Telegram / email) and stays invisible when the field is absent.
 */
import { describe, it, expect } from "vitest";
import {
  buildIncidentWhatsAppMessage,
  buildIncidentTelegramMessage,
} from "../../../messagingService/message.helper.js";
import MailHelper from "../../../mailService/mail.helper.js";

const base = {
  incidentName: "PPE Testing",
  incidentType: "personalProtectiveEquipment",
  timeOfIncident: "2026-07-15T14:26:04Z",
  severity: "moderate",
};

// Minimal stand-ins for the two row layouts used across the templates.
const html = `<tr>
<td><strong>Time of Incident</strong></td>
<td>15/07/2026</td>
</tr>
<tr><td><strong>Zone</strong></td><td>Gate</td></tr>`;

// vehicleObstruction has no "Time of Incident" row — it uses dispatch times.
const dispatchHtml = `<tr>
<td><strong>Dispatch Exit Time:</strong> 15/07/2026</td>
</tr>
<tr><td><strong>Zone:</strong> Gate</td></tr>`;

describe("ConfidenceScoreInPercentage in alerts", () => {
  it("shows a Confidence line on WhatsApp", () => {
    const msg = buildIncidentWhatsAppMessage({ ...base, ConfidenceScoreInPercentage: 92.5 }, {}, {}, "UTC");
    expect(msg).toContain("*Confidence:* 92.5%");
  });

  it("shows an escaped Confidence line on Telegram", () => {
    const msg = buildIncidentTelegramMessage({ ...base, ConfidenceScoreInPercentage: 92.5 }, {}, {}, "UTC");
    expect(msg).toContain("*Confidence:* 92\\.5%"); // MarkdownV2 escapes the dot
  });

  it("adds the row after Time of Incident and tags the subject for email", () => {
    const email = { subject: "[Incident Alert] PPE | Severity: moderate", html };
    MailHelper._withConfidence(email, [["a@b.com"], { ...base, ConfidenceScoreInPercentage: 92.5 }]);
    expect(email.subject).toBe("[Incident Alert] PPE | Severity: moderate | Confidence: 92.5%");
    expect(email.html).toContain("Confidence:</strong> 92.5%");
    expect(email.html.indexOf("Confidence")).toBeGreaterThan(email.html.indexOf("Time of Incident"));
    expect(email.html.indexOf("Confidence")).toBeLessThan(email.html.indexOf("Zone"));
  });

  it("anchors on Dispatch Exit Time for vehicleObstruction mails", () => {
    const email = { subject: "s", html: dispatchHtml };
    MailHelper._withConfidence(email, [[], { ...base, incidentType: "vehicleObstruction", ConfidenceScoreInPercentage: 80 }]);
    expect(email.html).toContain("Confidence:</strong> 80%");
    expect(email.html.indexOf("Confidence")).toBeLessThan(email.html.indexOf("Zone"));
  });

  it("changes nothing when the field is absent", () => {
    const email = { subject: "subject", html };
    MailHelper._withConfidence(email, [["a@b.com"], base]);
    expect(email.subject).toBe("subject");
    expect(email.html).toBe(html);
    expect(buildIncidentWhatsAppMessage(base, {}, {}, "UTC")).not.toContain("Confidence");
    expect(buildIncidentTelegramMessage(base, {}, {}, "UTC")).not.toContain("CONFIDENCE");
  });

  it("keeps a 0% confidence visible", () => {
    const msg = buildIncidentWhatsAppMessage({ ...base, ConfidenceScoreInPercentage: 0 }, {}, {}, "UTC");
    expect(msg).toContain("*Confidence:* 0%");
  });
});

describe("optional vehicle fields in alerts", () => {
  const obstruction = {
    ...base,
    incidentType: "vehicleObstruction",
    dispatchEntryTime: "2026-07-15T14:00:00Z",
    vehicleNumber: "KA01AB1234",
    vehicleType: "truck",
  };

  it("shows both vehicle lines on WhatsApp and Telegram", () => {
    const wa = buildIncidentWhatsAppMessage(obstruction, {}, {}, "UTC");
    expect(wa).toContain("*Vehicle Number:* KA01AB1234");
    expect(wa).toContain("*Vehicle Type:* truck");

    const tg = buildIncidentTelegramMessage(obstruction, {}, {}, "UTC");
    expect(tg).toContain("*Vehicle Number:* KA01AB1234");
    expect(tg).toContain("*Vehicle Type:* TRUCK");
  });

  it("omits each line independently when the field is missing", () => {
    const wa = buildIncidentWhatsAppMessage({ ...obstruction, vehicleType: null }, {}, {}, "UTC");
    expect(wa).toContain("*Vehicle Number:*");
    expect(wa).not.toContain("Vehicle Type");

    const tg = buildIncidentTelegramMessage({ ...obstruction, vehicleNumber: null, vehicleType: null }, {}, {}, "UTC");
    expect(tg).not.toContain("Vehicle");
  });
});
