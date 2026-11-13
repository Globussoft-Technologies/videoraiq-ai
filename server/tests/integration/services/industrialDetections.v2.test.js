import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";


vi.mock('../../../core/v2/jobs/utils/deletionQueue.js', () => ({ deletionQueue: { add: vi.fn() } }));
vi.mock('../../../core/v2/jobs/jobs.service.js', () => ({ default: {} }));
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
const { buildIncidentTelegramMessage, buildIncidentWhatsAppMessage } = await import(
  "../../../messagingService/message.helper.js"
);
const { industrialDetectionTemplate } = await import(
  "../../../mailService/IncidentsMailTemplates/mail.incidentsTemplate.js"
);

const CASES = [
  {
    settingType: 'machineOpsDetectionSettings', incidentType: 'machineOpsDetection',
    SettingModel: settingsModels.MachineOpsDetectionSetting, IncidentModel: incidentModels.MachineOpsDetectionIncident,
    logMethod: 'getMachineOpsDetectionLogs',
    incidentFields: { eventId: 'machine-off-1', machineId: 'laser-cutter-1', machineName: 'Laser Cutter 1', machineState: 'OFF' },
  },
  {
    settingType: "genderAgeDetectionSettings", incidentType: "genderAgeDetection",
    SettingModel: settingsModels.GenderAgeDetectionSetting, IncidentModel: incidentModels.GenderAgeDetectionIncident,
    logMethod: "getGenderAgeDetectionLogs",
    incidentFields: { targetGender: "Female", zoneIdx: 0, violatorCount: 1, violatingTrackIds: [101], details: [
      { track_id: 101, bbox: [120, 80, 260, 420], gender: "Female", confidence: 0.884, age: 27 },
    ] },
  },
  {
    settingType: "emotionDetectionSettings",
    incidentType: "emotionDetection",
    SettingModel: settingsModels.EmotionDetectionSetting,
    IncidentModel: incidentModels.EmotionDetectionIncident,
    logMethod: "getEmotionDetectionLogs",
    incidentFields: { emotionGroup: "negative", emotion: "Sadness", confidence: 0.908, durationSec: 5, trackId: "track-1", identity: "Asha Rao", employeeId: "EMP-1023", model: "emotion_b0", zoneName: "Lobby" },
  },
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
    settingType: "equipmentOilLeakageDetectionSettings",
    incidentType: "equipmentOilLeakageDetection",
    SettingModel: settingsModels.EquipmentOilLeakageDetectionSetting,
    IncidentModel: incidentModels.EquipmentOilLeakageDetectionIncident,
    logMethod: "getEquipmentOilLeakageDetectionLogs",
  },
  {
    settingType: "vehicleFuelOilLeakageDetectionSettings",
    incidentType: "vehicleFuelOilLeakageDetection",
    SettingModel: settingsModels.VehicleFuelOilLeakageDetectionSetting,
    IncidentModel: incidentModels.VehicleFuelOilLeakageDetectionIncident,
    logMethod: "getVehicleFuelOilLeakageDetectionLogs",
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
  {
    settingType: "loadingUnloadingStockCountingSettings",
    incidentType: "loadingUnloadingStockCountingDetection",
    SettingModel: settingsModels.LoadingUnloadingStockCountingSetting,
    IncidentModel: incidentModels.LoadingUnloadingStockCountingIncident,
    logMethod: "getLoadingUnloadingStockCountingLogs",
    incidentFields: {
      schemaVersion: "1.0",
      eventId: "stock-event-1",
      vehicleSessionId: "stock-session-1",
      vehicleNumber: "MH12AB1234",
      direction: "loading",
      lineCrossingDirection: "entry",
      boxType: "brown",
      boxCount: 5,
      countMethod: "configured_bundle_size",
      classificationStatus: "classified",
      classificationConfidence: 0.93,
      defaultCountApplied: false,
      truckPresent: true,
    },
  },
  {
    settingType: "boxPackingDetectionSettings",
    incidentType: "boxPackingDetection",
    SettingModel: settingsModels.BoxPackingDetectionSetting,
    IncidentModel: incidentModels.BoxPackingDetectionIncident,
    // No dedicated logs page; shows in the Incident Center.
    // Shape DS sends when a box is accepted.
    incidentFields: {
      boxId: "W1-0014",
      completedBy: "W1 bottom-left",
      zones: {
        "W1 bottom-left": { box_number: 14, time_taken: 110 },
        "W2 top-right": { box_number: 11, time_taken: 170 },
      },
      severity: "info",
      triggerNotification: false,
      endTimeSource: "CONFIRMED",
      detectedVia: "idle",
      confirmationReason: "The filled container has been removed from the workstation.",
    },
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

describe("stock-counting vehicle aggregation", () => {
  it("groups events by normalized vehicle number and sums box counts", async () => {
    const nvr = await NVR.create({
      userId: admin.user_id,
      nvrName: "Stock NVR",
      brand: "hikvision",
      domain: "http://stock-nvr.test",
      location: "loading bay",
      localNvrId: "stock-aggregate-nvr",
    });
    const channel = await Channel.create({
      userId: admin.user_id,
      nvrId: nvr._id,
      localChannelId: "1",
      name: "Stock Camera",
      streamingPath: "/Streaming/Channels/101",
      isAdded: true,
    });

    const common = {
      nvrId: nvr._id,
      channelId: channel._id,
      userId: admin.user_id,
      incidentName: "Stock Movement Detected",
      zone: "Loading/Unloading Bay",
      severity: "moderate",
      boxType: "brown",
      classificationStatus: "classified",
      truckPresent: true,
    };
    await incidentModels.LoadingUnloadingStockCountingIncident.create([
      {
        ...common,
        timeOfIncident: new Date("2026-09-30T10:15:42Z"),
        eventId: "event-1",
        vehicleSessionId: "session-1",
        vehicleNumber: "mh12ab1234",
        direction: "loading",
        boxCount: 5,
        brownCount: 4,
        whiteCount: 1,
        otherCount: 0,
        Image: "/incidents/stock/event-1.jpg",
        classificationConfidence: 0.93,
      },
      {
        ...common,
        timeOfIncident: new Date("2026-09-30T10:20:42Z"),
        eventId: "event-2",
        vehicleSessionId: "session-1",
        vehicleNumber: " MH12AB1234 ",
        direction: "unloading",
        boxCount: 3,
        brownCount: 2,
        whiteCount: 1,
        otherCount: 0,
        Image: "/incidents/stock/event-2.jpg",
        classificationConfidence: 0.89,
      },
      {
        ...common,
        timeOfIncident: new Date("2026-09-30T10:25:42Z"),
        eventId: "event-3",
        vehicleSessionId: "session-2",
        vehicleNumber: "KA01CD5678",
        direction: "loading",
        boxCount: 2,
        Image: "/incidents/stock/event-3.jpg",
        classificationConfidence: 0.95,
      },
    ]);

    const logsContext = serviceCtx({
      user_id: admin.user_id,
      adminId: admin._id,
      query: {
        skip: "0",
        limit: "10",
        startDate: "2026-09-30",
        endDate: "2026-09-30",
      },
    });
    await IncidentsService.getLoadingUnloadingStockCountingLogs(
      logsContext.req,
      logsContext.res,
      logsContext.next,
    );

    expect(logsContext.res.statusCode).toBe(200);
    const result = payload(logsContext.res).data;
    expect(result.totalCount).toBe(2);
    const vehicle = result.data.find((row) => row.vehicleNumber === "MH12AB1234");
    expect(vehicle).toMatchObject({
      direction: "both",
      boxCount: 8,
      count: 8,
      loadedBoxCount: 5,
      unloadedBoxCount: 3,
      eventCount: 2,
      sessionCount: 1,
      Image: "/incidents/stock/event-2.jpg",
      brownCount: 6,
      whiteCount: 2,
      otherCount: 0,
      colourCounted: true,
    });
    // event-3 predates the colour split, so its row falls back to boxTypes.
    expect(result.data.find((row) => row.vehicleNumber === "KA01CD5678").colourCounted).toBe(false);
    expect(vehicle.events).toHaveLength(2);
    expect(vehicle.events).toEqual([
      expect.objectContaining({
        eventId: "event-2",
        direction: "unloading",
        boxCount: 3,
        brownCount: 2,
        whiteCount: 1,
        Image: "/incidents/stock/event-2.jpg",
      }),
      expect.objectContaining({
        eventId: "event-1",
        direction: "loading",
        boxCount: 5,
        Image: "/incidents/stock/event-1.jpg",
      }),
    ]);
    const filteredContext = serviceCtx({
      user_id: admin.user_id,
      adminId: admin._id,
      query: {
        skip: "0",
        limit: "10",
        startDate: "2026-09-30",
        endDate: "2026-09-30",
        vehicleNumber: "mh12ab1234",
      },
    });
    await IncidentsService.getLoadingUnloadingStockCountingLogs(
      filteredContext.req,
      filteredContext.res,
      filteredContext.next,
    );
    const filteredResult = payload(filteredContext.res).data;
    expect(filteredResult.totalCount).toBe(1);
    expect(filteredResult.data[0]).toMatchObject({
      vehicleNumber: "MH12AB1234",
      boxCount: 8,
    });
  });
  it("groups UNKNOWN1, UNKNOWN2... like plates, including after a PATCH, but keeps bare UNKNOWN apart", async () => {
    const nvr = await NVR.create({
      userId: admin.user_id,
      nvrName: "Stock NVR",
      brand: "hikvision",
      domain: "http://stock-nvr.test",
      location: "loading bay",
      localNvrId: "stock-unknown-nvr",
    });
    const channel = await Channel.create({
      userId: admin.user_id,
      nvrId: nvr._id,
      localChannelId: "1",
      name: "Stock Camera",
      streamingPath: "/Streaming/Channels/101",
      isAdded: true,
    });
    const common = {
      nvrId: nvr._id,
      channelId: channel._id,
      userId: admin.user_id,
      incidentName: "Stock Movement Detected",
      direction: "loading",
      boxType: "brown",
    };
    const [renamed] = await incidentModels.LoadingUnloadingStockCountingIncident.create([
      { ...common, timeOfIncident: new Date("2026-09-30T11:00:00Z"), eventId: "u-1", vehicleNumber: "UNKNOWN", boxCount: 2 },
      { ...common, timeOfIncident: new Date("2026-09-30T11:05:00Z"), eventId: "u-2", vehicleNumber: "UNKNOWN3", boxCount: 3 },
      { ...common, timeOfIncident: new Date("2026-09-30T11:10:00Z"), eventId: "u-3", vehicleNumber: "UNKNOWN", boxCount: 1 },
      { ...common, timeOfIncident: new Date("2026-09-30T11:15:00Z"), eventId: "u-4", vehicleNumber: "", boxCount: 4 },
    ]);

    // DS later recognises the first truck as its UNKNOWN3 and PATCHes it.
    const edit = serviceCtx({
      user_id: admin.user_id,
      adminId: admin._id,
      params: { id: String(renamed._id) },
      body: { vehicleNumber: "UNKNOWN3" },
    });
    await IncidentsService.editIncidentDetails(edit.req, edit.res, edit.next);
    expect(edit.res.statusCode).toBe(200);
    const stored = await incidentModels.LoadingUnloadingStockCountingIncident.findById(renamed._id).lean();
    expect(stored.vehicleNumber).toBe("UNKNOWN3");

    const logsContext = serviceCtx({
      user_id: admin.user_id,
      adminId: admin._id,
      query: { skip: "0", limit: "10", startDate: "2026-09-30", endDate: "2026-09-30" },
    });
    await IncidentsService.getLoadingUnloadingStockCountingLogs(
      logsContext.req,
      logsContext.res,
      logsContext.next,
    );
    const result = payload(logsContext.res).data;

    // Both UNKNOWN3 events land in one row, like a real plate.
    const unknown3 = result.data.filter((row) => row.vehicleNumber === "UNKNOWN3");
    expect(unknown3).toHaveLength(1);
    expect(unknown3[0]).toMatchObject({ boxCount: 5, eventCount: 2 });
    // Bare UNKNOWN and a blank plate are still unreadable: one row each, shown blank.
    expect(result.data.filter((row) => row.vehicleNumber === "")).toHaveLength(2);
    expect(result.totalCount).toBe(3);
  });
});

describe("v2 industrial detection incidents and logs", () => {
  it.each(CASES)(
    "creates and lists $incidentType",
    async ({ settingType, incidentType, SettingModel, IncidentModel, logMethod, incidentFields = {} }) => {
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
          settings: {
            levelOfImportance: "high",
            metricType: "gauge",
            ...(settingType === "emotionDetectionSettings" ? {
              referencePoints: { [channel._id.toString()]: [
                [[0, 0], [100, 0], [100, 100], [0, 100]],
                [[200, 0], [300, 0], [300, 100], [200, 100]],
              ] },
              zone_configs: [{ name: "Lobby", emotion_alert_groups: ["negative"] }, { name: "Reception", emotion_alert_groups: ["positive", "neutral", "negative", "surprise"] }],
            } : {}),
            ...(settingType === "genderAgeDetectionSettings" ? {
              referencePoints: { [channel._id.toString()]: [
                [[120, 80], [900, 80], [900, 700], [120, 700]],
                [[950, 80], [1850, 80], [1850, 700], [950, 700]],
              ] },
              zone_configs: [{ name: " Reception ", target_gender: "Female" }, { name: " Shop Floor ", target_gender: "Male" }],
            } : {}),
            ...(settingType === 'machineOpsDetectionSettings' ? { machines: [{ machine_id: 'laser-cutter-1', name: 'Laser Cutter 1',
              machine_zone: [[0, 0], [0.5, 0], [0.5, 1]], indicator_zone: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
            }] } : {}),
            ...(settingType === "loadingUnloadingStockCountingSettings" ? { mode: "loading" } : {}),
          },
        },
      });
      await DetectionSettingsService.createDetectionSettings(
        settingsContext.req,
        settingsContext.res,
        settingsContext.next,
      );
      expect(settingsContext.res.statusCode).toBe(201);
      expect(await SettingModel.countDocuments({ settingType })).toBe(1);
      if (settingType === "genderAgeDetectionSettings") {
        const setting = await SettingModel.findOne({ settingType }).lean();
        expect(setting.settings.zone_configs.map(zone => zone.target_gender)).toEqual(["Female", "Male"]);
        expect(setting.settings.zone_configs.map(zone => zone.name)).toEqual(["Reception", "Shop Floor"]);
        expect(setting.settings.gender_confidence_threshold).toBe(0.6);
        const edit = serviceCtx({
          user_id: admin.user_id, adminId: admin._id, params: { id: String(setting._id) },
          body: { settings: { zone_configs: [
            { name: " Updated Reception ", target_gender: "Female" },
            { name: " Shop Floor ", target_gender: "Male" },
          ] } },
        });
        await DetectionSettingsService.updateDetectionSettings(edit.req, edit.res, edit.next);
        expect(payload(edit.res).status).toBe("success");
        const updated = await SettingModel.findById(setting._id).lean();
        expect(updated.settings.zone_configs.map(zone => zone.name)).toEqual(["Updated Reception", "Shop Floor"]);
      }
      if (settingType === "emotionDetectionSettings") {
        const setting = await SettingModel.findOne({ settingType });
        expect(setting.settings.zone_configs.map(zone => zone.name)).toEqual(["Lobby", "Reception"]);
        expect(setting.settings.zone_configs.map(zone => [...zone.emotion_alert_groups])).toEqual([
          ["negative"], ["positive", "neutral", "negative", "surprise"],
        ]);
        const edit = serviceCtx({
          user_id: admin.user_id, adminId: admin._id, params: { id: String(setting._id) },
          body: { settings: { zone_configs: [
            { name: "Lobby", emotion_alert_groups: ["positive", "neutral", "negative", "surprise"] },
            { name: "Reception", emotion_alert_groups: ["surprise"] },
          ] } },
        });
        await DetectionSettingsService.updateDetectionSettings(edit.req, edit.res, edit.next);
        expect(payload(edit.res).status).toBe("success");
        const updated = await SettingModel.findById(setting._id).lean();
        expect(updated.settings.zone_configs.map(zone => zone.emotion_alert_groups)).toEqual([
          ["positive", "neutral", "negative", "surprise"], ["surprise"],
        ]);
        expect(setting.settings.referencePoints[channel._id.toString()]).toHaveLength(2);
        const populated = await Channel.findById(channel._id).populate('detections.emotionDetectionSettings.id');
        expect(populated.detections.emotionDetectionSettings.id.settingType).toBe('emotionDetectionSettings');
      }

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
          ...incidentFields,
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
      if (!["genderAgeDetection", "machineOpsDetection"].includes(incidentType)) expect(saved.alertThreshold).toBe(400);
      if (["emotionDetection", "genderAgeDetection", "machineOpsDetection"].includes(incidentType)) expect(saved.toObject()).toMatchObject(incidentFields);
      if (incidentType === "boxPackingDetection") {
        const box = saved.toObject();
        expect(box).toMatchObject({
          boxId: "W1-0014",
          completedBy: "W1 bottom-left",
          severity: "info",
          endTimeSource: "CONFIRMED",
          detectedVia: "idle",
          zones: [
            { zone: "W1 bottom-left", boxNumber: 14, timeTakenSec: 110 },
            { zone: "W2 top-right", boxNumber: 11, timeTakenSec: 170 },
          ],
        });
        expect(buildIncidentWhatsAppMessage(box)).toContain("*W2 top-right:* Box 11, 170s");
        expect(buildIncidentTelegramMessage(box)).toContain("*Box ID:* W1\\-0014");
        const html = industrialDetectionTemplate(box, {}, {}, "UTC");
        expect(html).toContain("Box Packing Details");
        expect(html).toContain("Severity: Info");
      }
      if (settingType === "loadingUnloadingStockCountingSettings") {
        const savedSetting = await SettingModel.findOne({ settingType });
        expect(savedSetting.settings.mode).toBe("loading");

        const retryContext = serviceCtx({
          user_id: admin.user_id,
          adminId: admin._id,
          body: { ...createContext.req.body },
        });
        await IncidentsService.createIncidents(
          retryContext.req,
          retryContext.res,
          retryContext.next,
        );
        expect(payload(retryContext.res).data.duplicate).toBe(true);
        expect(await IncidentModel.countDocuments({ incidentType })).toBe(1);
      }

      if (!logMethod) return;
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
      if (incidentType === "emotionDetection") {
        for (const field of ['timeOfIncident', 'incidentName', 'Image']) {
          const body = { ...createContext.req.body };
          delete body[field];
          const invalid = serviceCtx({ body });
          await IncidentsService.createIncidents(invalid.req, invalid.res, invalid.next);
          expect(invalid.res.statusCode).toBe(400);
        }
        expect(await IncidentModel.countDocuments({ incidentType })).toBe(1);
        expect(payload(logsContext.res).data.data[0]).toMatchObject({
          ...incidentFields, nvrData: { nvrName: "Industrial NVR" }, channelData: { name: "Industrial Camera" },
        });
        const search = serviceCtx({ user_id: admin.user_id, adminId: admin._id, query: { search: "Sadness" } });
        await IncidentsService.getEmotionDetectionLogs(search.req, search.res, search.next);
        expect(payload(search.res).data.totalCount).toBe(1);
        const missing = serviceCtx({ user_id: admin.user_id, adminId: admin._id, query: { search: "Happiness" } });
        await IncidentsService.getEmotionDetectionLogs(missing.req, missing.res, missing.next);
        expect(payload(missing.res).data.totalCount).toBe(0);
        const denied = serviceCtx({
          user_id: admin.user_id, adminId: admin._id, memberId: "member",
          permissionConfig: [{ permissionConfig: { logs: { emotionLogs: { view: false }, global: { view: true } } } }],
        });
        await IncidentsService.getEmotionDetectionLogs(denied.req, denied.res, denied.next);
        expect(denied.res.statusCode).toBe(403);

        await IncidentModel.create([
          { ...createContext.req.body, userId: admin.user_id, emotion: 'Happiness' },
          { ...createContext.req.body, userId: admin.user_id, emotion: 'Anger' },
          { ...createContext.req.body, userId: 'another-tenant', emotion: 'Disgust' },
        ]);
        const selected = serviceCtx({
          user_id: admin.user_id, adminId: admin._id,
          query: { emotions: 'Sadness,Happiness', nvrIds: String(nvr._id), channelIds: String(channel._id), limit: '1' },
        });
        await IncidentsService.getEmotionDetectionLogs(selected.req, selected.res, selected.next);
        expect(payload(selected.res).data.totalCount).toBe(2);
        expect(payload(selected.res).data.data).toHaveLength(1);
        expect(payload(selected.res).data.emotionOptions).toEqual(['Anger', 'Happiness', 'Sadness']);
        // Export requests use the same filters with a larger page size.
        selected.req.query.limit = '10000';
        await IncidentsService.getEmotionDetectionLogs(selected.req, selected.res, selected.next);
        expect(payload(selected.res).data.data.map(row => row.emotion).sort()).toEqual(['Happiness', 'Sadness']);
        const noCameraAccess = serviceCtx({
          user_id: admin.user_id, adminId: admin._id, authorizedChannel: { channels: [] }, query: {},
        });
        await IncidentsService.getEmotionDetectionLogs(noCameraAccess.req, noCameraAccess.res, noCameraAccess.next);
        expect(payload(noCameraAccess.res).data.emotionOptions).toEqual([]);
        expect(payload(noCameraAccess.res).data.totalCount).toBe(0);
      }
    },
  );
});

describe("desk solar shoulder absence incidents", () => {
  it("opens one incident per absence and closes it when DS reposts the eventId", async () => {
    const nvr = await NVR.create({
      userId: admin.user_id,
      nvrName: "Solder NVR",
      brand: "hikvision",
      domain: "http://solder-nvr.test",
      location: "solder line",
      localNvrId: "desk-solar-nvr",
    });
    const channel = await Channel.create({
      userId: admin.user_id,
      nvrId: nvr._id,
      localChannelId: "1",
      name: "Overhead Camera",
      streamingPath: "/Streaming/Channels/101",
      isAdded: true,
    });
    await DetectionAllocation.create({
      adminId: admin._id,
      settingType: "deskSolarShoulderDetectionSettings",
      enabled: true,
      cameraAllocation: 10,
    });
    const settingsContext = serviceCtx({
      user_id: admin.user_id,
      adminId: admin._id,
      body: {
        name: "Solder line desks",
        settingType: "deskSolarShoulderDetectionSettings",
        enabled: true,
        alerts: [],
        NVRId: nvr._id.toString(),
        channelId: [channel._id.toString()],
        settings: {
          levelOfImportance: "moderate",
          zone_configs: [{ name: "Workstation 1", capacity: 1, threshold_sec: 20 }],
        },
      },
    });
    await DetectionSettingsService.createDetectionSettings(
      settingsContext.req,
      settingsContext.res,
      settingsContext.next,
    );
    expect(settingsContext.res.statusCode).toBe(201);

    const post = async (body) => {
      const ctx = serviceCtx({
        user_id: admin.user_id,
        adminId: admin._id,
        body: {
          incidentType: "deskSolarShoulderDetection",
          incidentName: "Desk Empty",
          cameraId: channel._id.toString(),
          nvrId: nvr._id.toString(),
          channelId: channel._id.toString(),
          severity: "moderate",
          adminId: admin._id.toString(),
          eventId: "absence-1",
          ...body,
        },
      });
      await IncidentsService.createIncidents(ctx.req, ctx.res, ctx.next);
      return ctx.res;
    };

    // Opening event: desk empty past threshold_sec.
    const opened = await post({
      timeOfIncident: "2026-10-07T06:10:00Z",
      zoneName: "Workstation 1",
      personCount: 0,
      capacity: 1,
      thresholdSec: 20,
      durationSec: 20,
      Image: "https://nas.example.com/incidents/desk.jpg",
    });
    expect(payload(opened)).toMatchObject({ status: "success" });
    const open = await incidentModels.DeskSolarShoulderDetectionIncident.findOne({ eventId: "absence-1" });
    expect(open).toMatchObject({ zone: "Workstation 1", capacity: 1, thresholdSec: 20, returnedAt: null });

    // Operator back: same eventId closes it instead of adding a second alert.
    const closed = await post({ returnedAt: "2026-10-07T06:12:14Z", durationSec: 134 });
    expect(payload(closed).data.duplicate).toBe(true);
    const docs = await incidentModels.DeskSolarShoulderDetectionIncident.find({ eventId: "absence-1" });
    expect(docs).toHaveLength(1);
    expect(docs[0].returnedAt.toISOString()).toBe("2026-10-07T06:12:14.000Z");
    expect(docs[0].durationSec).toBe(134);

    // DS's per-panel payload: a complete panel is only a throughput sample…
    const panel = (panelId, rightDone) => ({
      eventId: undefined,
      incidentName: "Solar panel processing",
      panelId,
      timeOfIncident: "2026-10-07T06:20:00Z",
      Image: "https://nas.example.com/incidents/panel.jpg",
      zones: {
        worker_zone_left: { presence_time: 14.3, shoulderings_done: 3 },
        worker_zone_right: { presence_time: 12.8, shoulderings_done: rightDone },
      },
    });
    const complete = await post(panel("PNL-0374", 3));
    expect(payload(complete).data).toMatchObject({ panelId: "PNL-0374", missedJoints: 0 });
    expect(await incidentModels.DeskSolarShoulderDetectionIncident.countDocuments({ eventType: "panel" })).toBe(0);

    // …a panel with a joint left undone also becomes an incident (and alerts),
    // and DS retrying the same post doesn't raise a second one.
    await post(panel("PNL-0375", 2));
    const retry = await post(panel("PNL-0375", 2));
    expect(payload(retry).data.duplicate).toBe(true);
    const panels = await incidentModels.DeskSolarShoulderDetectionIncident.find({ eventType: "panel" }).lean();
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ panelId: "PNL-0375", missedJoints: 1 });
    expect(panels[0].zones).toEqual([
      { zone: "worker_zone_left", presenceSec: 14.3, done: 3 },
      { zone: "worker_zone_right", presenceSec: 12.8, done: 2 },
    ]);
  });
});
