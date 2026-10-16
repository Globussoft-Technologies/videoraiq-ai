// Door settings checked on save (DS door contract §3.1): alert mode
// open/closed/all and each door's duration at least one minute.
import { describe, expect, it } from "vitest";
import DetectionSettingsValidation from "../../../core/v2/detectionSettings/detectionSettings.validate.js";

const check = (settings, settingType = "doorDetectionSettings") =>
  DetectionSettingsValidation.validateDoorSettings(settingType, settings).error?.message ?? null;

describe("validateDoorSettings", () => {
  it("accepts the contract's values", () => {
    expect(check({ door_alert_mode: "all", zone_configs: [{ name: "Main Door", threshold_sec: 60 }] })).toBeNull();
  });

  it("rejects an unknown alert mode and a door under a minute", () => {
    expect(check({ door_alert_mode: "ajar" })).toMatch(/open, closed, or all/);
    expect(check({ zone_configs: [{ name: "Back Door", threshold_sec: 59 }] })).toMatch(/Back Door .* at least 1 minute/);
    expect(check({ zone_configs: [{ name: "Side Door" }] })).toMatch(/Side Door/);
  });

  it("leaves other detection types alone", () => {
    expect(check({ zone_configs: [{ threshold_sec: 5 }] }, "crowdDetectionSettings")).toBeNull();
  });
});
