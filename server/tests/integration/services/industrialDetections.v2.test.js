import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v2/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined),
}));

const { default: IncidentsService } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const settingsModels = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const incidentModels = await import("../../../core/v2/incidents/incidents.model.js");

const CASES = [
  {
    settingType: "workingAtHeightDetectionSettings",
    incidentType: "workingAtHeightDetection",
    SettingModel: settingsModels.WorkingAtHeightDetectionSetting,
    IncidentModel: incidentModels.WorkingAtHeightDetectionIncident,
    logMethod: "getWorkingAtHeightDetectionLogs",
  },
  {
    settingType: "oilLeakageDetectionSettings",
    incidentType: "oilLeakageDetection",
    SettingModel: settingsModels.OilLeakageDetectionSetting,
    IncidentModel: incidentModels.OilLeakageDetectionIncident,
    logMethod: "getOilLeakageDetectionLogs",
  },
  {
    settingType: "gunnyBagsMaterialsWrongLocationDetectionSettings",
    incidentType: "gunnyBagsMaterialsWrongLocationDetection",
    SettingModel: settingsModels.GunnyBagsMaterialsWrongLocationDetectionSetting,
    IncidentModel: incidentModels.GunnyBagsMaterialsWrongLocationDetectionIncident,
    logMethod: "getGunnyBagsMaterialsWrongLocationDetectionLogs",
  },
  {
    settingType: "sandDustWasteScrapDisposalDetectionSettings",
    incidentType: "sandDustWasteScrapDisposalDetection",
    SettingModel: settingsModels.SandDustWasteScrapDisposalDetectionSetting,
    IncidentModel: incidentModels.SandDustWasteScrapDisposalDetectionIncident,
    logMethod: "getSandDustWasteScrapDisposalDetectionLogs",
  },
  {
    settingType: "unauthorizedAnimalEntryDetectionSettings",
    incidentType: "unauthorizedAnimalEntryDetection",
    SettingModel: settingsModels.UnauthorizedAnimalEntryDetectionSetting,
    IncidentModel: incidentModels.UnauthorizedAnimalEntryDetectionIncident,
    logMethod: "getUnauthorizedAnimalEntryDetectionLogs",
  },
  {
    settingType: "spillsDirtyMessyAreasDetectionSettings",
    incidentType: "spillsDirtyMessyAreasDetection",
    SettingModel: settingsModels.SpillsDirtyMessyAreasDetectionSetting,
    IncidentModel: incidentModels.SpillsDirtyMessyAreasDetectionIncident,
    logMethod: "getSpillsDirtyMessyAreasDetectionLogs",
  },
];

let admin;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "industrial-user",
    login: "industrial-user",
    email: "industrial@test.com",
  });
});

describe("v2 industrial detection incidents and logs", () => {
  it.each(CASES)(
    "creates and lists $incidentType",
    async ({ settingType, incidentType, SettingModel, IncidentModel, logMethod }) => {
      const nvr = await NVR.create({
        userId: admin.user_id,
        nvrName: "Industrial NVR",
        brand: "hikvision",
        domain: "http://industrial-nvr.test",
        location: "factory",
        localNvrId: `${incidentType}-nvr`,
      });
      const channel = await Channel.create({
        userId: admin.user_id,
        nvrId: nvr._id,
        localChannelId: "1",
        name: "Industrial Camera",
        streamingPath: "/Streaming/Channels/101",
        isAdded: true,
      });
      await DetectionAllocation.create({
        adminId: admin._id,
        settingType,
        enabled: true,
        cameraAllocation: 10,
      });
      const settingsContext = serviceCtx({
        user_id: admin.user_id,
        adminId: admin._id,
        body: {
          name: `${incidentType} setting`,
          settingType,
          enabled: true,
          alerts: [],
          NVRId: nvr._id.toString(),
          channelId: [channel._id.toString()],
          settings: { levelOfImportance: "high", metricType: "gauge" },
        },
      });
      await DetectionSettingsService.createDetectionSettings(
        settingsContext.req,
        settingsContext.res,
        settingsContext.next,
      );
      expect(settingsContext.res.statusCode).toBe(201);
      expect(await SettingModel.countDocuments({ settingType })).toBe(1);

      const incidentTime = "2026-09-21T12:30:45Z";
      const createContext = serviceCtx({
        user_id: admin.user_id,
        adminId: admin._id,
        body: {
          incidentType,
          timeOfIncident: incidentTime,
          description: `${incidentType} detected`,
          incidentName: `${incidentType} Detected`,
          cameraId: channel._id.toString(),
          nvrId: nvr._id.toString(),
          channelId: channel._id.toString(),
          Image: "https://nas.example.com/incidents/industrial.jpg",
          zone: "Factory Floor",
          type: "gauge",
          severity: "high",
          alertThreshold: 400,
          triggerNotification: true,
          adminId: admin._id.toString(),
          count: 1,
        },
      });

      await IncidentsService.createIncidents(
        createContext.req,
        createContext.res,
        createContext.next,
      );

      expect(createContext.res.statusCode).toBe(200);
      expect(payload(createContext.res).status).toBe("success");
      const saved = await IncidentModel.findOne({ incidentType });
      expect(saved.timeOfIncident.toISOString()).toBe("2026-09-21T12:30:45.000Z");
      expect(saved.alertThreshold).toBe(400);

      const logsContext = serviceCtx({
        user_id: admin.user_id,
        adminId: admin._id,
        query: { skip: "0", limit: "10" },
      });
      await IncidentsService[logMethod](
        logsContext.req,
        logsContext.res,
        logsContext.next,
      );

      expect(logsContext.res.statusCode).toBe(200);
      expect(payload(logsContext.res).data.totalCount).toBe(1);
      expect(payload(logsContext.res).data.data[0].incidentType).toBe(incidentType);
    },
  );
});
