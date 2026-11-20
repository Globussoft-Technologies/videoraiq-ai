import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "../../core/v1/admin/admin.model.js";
import { customDetectionName, incidentForEmail } from "../../utils/detectionDisplayNames.js";
import {
  getDetectionDisplayNames,
} from "../../core/v2/clientConfig/detectionDisplayNames.controller.js";

const adminId = "650000000000000000000001";
const settingType = "countVehiclesSettings";

function request(userData = {}) {
  return {
    verified: { userData: { adminId, ...userData } },
    params: { settingType },
  };
}

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("client detection display names", () => {
  it("labels canonical and historical incidents without changing the recorded event", () => {
    const names = new Map([["personalProtectiveEquipmentSettings", "Safety Gear"]]);
    const incident = { incidentType: "personalProtectiveEquipment", incidentName: "PPE Compliant" };
    expect(customDetectionName(names, "personProtectiveEquipment")).toBe("Safety Gear");
    expect(incidentForEmail(incident, names, incident.incidentType)).toEqual({
      incidentType: "personalProtectiveEquipment",
      incidentName: "Safety Gear",
      detectionDisplayName: "Safety Gear",
    });
    expect(incident.incidentName).toBe("PPE Compliant");
    expect(incidentForEmail(incident, {}, incident.incidentType)).toBe(incident);
  });
  it("reads the authenticated client's names and maps them to the existing log keys", async () => {
    const names = { [settingType]: "Gate Traffic" };
    const find = vi.spyOn(Admin, "findById")
      .mockReturnValue({ select: () => ({ lean: async () => ({ detectionDisplayNames: names }) }) });
    const res = response();
    await getDetectionDisplayNames(request({ memberId: "team-member" }), res);
    expect(find).toHaveBeenCalledWith(adminId);
    expect(res.json).toHaveBeenCalledWith({
      names,
      settingTypeByLogKey: expect.objectContaining({ vehicleCountLogs: settingType }),
      settingTypeByLogPermission: expect.objectContaining({ vehicleCountLogs: settingType }),
      settingTypeByIncidentType: expect.objectContaining({ countVehicles: settingType }),
    });
  });

  it("rejects registration links before reading an account's display names", async () => {
    const find = vi.spyOn(Admin, "findById");
    const res = response();
    await getDetectionDisplayNames(request({ registrationLinkId: "link" }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(find).not.toHaveBeenCalled();
  });
});
