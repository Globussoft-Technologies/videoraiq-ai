/**
 * buildIncidentTelegramMessage — Day line on every type; vehicleObstruction
 * swaps the Time line for Dispatch Entry/Exit times.
 */
import { describe, it, expect } from "vitest";
import {
  buildIncidentWhatsAppMessage,
  buildIncidentTelegramMessage,
  formatIncidentDay,
} from "../../../messagingService/message.helper.js";

const base = {
  incidentName: "PPE Testing",
  timeOfIncident: "2026-07-15T14:26:04Z", // a Wednesday
  severity: "moderate",
};

describe("formatIncidentDay", () => {
  it("returns the weekday in the given timezone", () => {
    expect(formatIncidentDay(base.timeOfIncident, "UTC")).toBe("Wednesday");
  });

  it("returns N/A for a missing timestamp", () => {
    expect(formatIncidentDay(null, "UTC")).toBe("N/A");
  });
});

describe("buildIncidentTelegramMessage", () => {
  it("adds a Day line and keeps the Time line for normal types", () => {
    const msg = buildIncidentTelegramMessage(
      { ...base, incidentType: "personalProtectiveEquipment" },
      {},
      {},
      "UTC",
    );
    expect(msg).toContain("*Day:* WEDNESDAY");
    expect(msg).toContain("*Time:*");
    expect(msg).not.toContain("Dispatch");
  });

  it("shows Dispatch Entry/Exit times instead of Time for vehicleObstruction", () => {
    const msg = buildIncidentTelegramMessage(
      { ...base, incidentType: "vehicleObstruction", dispatchEntryTime: "2026-07-15T14:00:00Z" },
      {},
      {},
      "UTC",
    );
    expect(msg).toContain("*Day:* WEDNESDAY");
    expect(msg).toContain("*Dispatch Entry Time:*");
    expect(msg).toContain("*Dispatch Exit Time:*");
    expect(msg).not.toContain("*Time:*");
  });

  it("shows N/A entry time when the payload did not include one", () => {
    const msg = buildIncidentTelegramMessage(
      { ...base, incidentType: "vehicleObstruction" },
      {},
      {},
      "UTC",
    );
    expect(msg).toContain("*Dispatch Entry Time:* N/A");
  });

  it("decodes HTML entities and includes a clickable image link", () => {
    const incident = {
      ...base,
      incidentName: "VEHICLE &AMP; OBSTRUCTION DETECTION",
      incidentType: "vehicleObstruction",
      Image: "img/obstruction.jpg",
    };

    const wa = buildIncidentWhatsAppMessage(incident, {}, {}, "UTC");
    expect(wa).toContain("*Name:* VEHICLE & OBSTRUCTION DETECTION");
    expect(wa).toContain("*Image Link:* http://imageview.test/img/obstruction.jpg");

    const tg = buildIncidentTelegramMessage(incident, {}, {}, "UTC");
    expect(tg).toContain("*Name:* VEHICLE & OBSTRUCTION DETECTION");
    expect(tg).toContain("*Image Link:* [View Image](http://imageview.test/img/obstruction.jpg)");
  });
});
