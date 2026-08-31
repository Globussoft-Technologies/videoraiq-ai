import logger from "../utils/logger.js";
import getStreamingUrl, {
  buildRTSPUrl,
  buildStreamingUrl,
  resolveHost,
} from "../utils/rtspStream.js";
import config from "config";
import NVR from "../core/v1/NVR/nvr.model.js";
import axios from "axios";
import {
  DETECTION_MODES_MAP,
  DS_DETECTOR_BY_MODE,
  dsDetectorsForModes,
} from "../constants/detectionTypes.js";
import { resolveAdminEndpoints } from "../utils/adminEndpoints.js";
const detectionHost = config.get("PythonService.detectionUrl");
const APP_ENV = config.get("APP_ENV");

const THRESHOLD_FIELDS_BY_DETECTOR = {
  faceAuth: ["person_threshold"],
  personalProtectiveEquipmentSettings: [
    "person_threshold",
    "vest_threshold",
    "helmet_threshold",
  ],
  foodServicePPEDetection: [
    "person_threshold",
    "emp_floor",
    "glove_floor",
    "apron_floor",
  ],
  crowdDetectionSettings: ["person_threshold"],
  lineCrossingSettings: ["person_threshold"],
  countPersonsSettings: ["person_threshold"],
  zoneIntrusionSettings: ["person_threshold"],
  deskAbsenceDetection: ["person_threshold"],
  tableOccupancySettings: ["person_threshold"],
  loiteringDetectionSettings: ["person_threshold"],
  countVehiclesSettings: ["vehicle_threshold"],
  vehicleObstructionSettings: ["vehicle_threshold"],
  vehicleTypeDetectionSettings: ["vehicle_threshold", "forklift_threshold"],
  numberPlateDetectionSettings: ["plate_confidence", "ocr_min_confidence"],
  mobilePhoneDetectionSettings: ["mobile_phone_confidence"],
  conveyorDetectionSettings: [],
  crusherDetectionSettings: [],
  waterSpillageDetectionSettings: [],
};

const pickDetectorThresholds = (detectorName, settings = {}) => {
  const fields = THRESHOLD_FIELDS_BY_DETECTOR[detectorName] || [];

  return fields.reduce((thresholds, field) => {
    if (settings[field] !== undefined) thresholds[field] = settings[field];
    return thresholds;
  }, {});
};

const pickLineCrossingSettings = (settings = {}) => {
  const payload = {};

  if (Array.isArray(settings.inside_reference_point)) {
    payload.inside_reference_point = settings.inside_reference_point;
  }

  if (settings.count_mode) {
    payload.count_mode = settings.count_mode;
  }

  return payload;
};

class PythonService {
  async toggleCamerasBulk(admin_id, camera_ids = [], enable = true) {
    try {
      if (!admin_id) {
        throw new Error("admin_id is required");
      }

      const normalizedCameraIds = (Array.isArray(camera_ids) ? camera_ids : [camera_ids])
        .map((cameraId) => String(cameraId || "").trim())
        .filter(Boolean);

      const payload = {
        admin_id: String(admin_id),
      };

      if (normalizedCameraIds.length === 1) {
        payload.camera_id = normalizedCameraIds[0];
      } else if (normalizedCameraIds.length > 1) {
        payload.camera_id = normalizedCameraIds;
      }

      const { detectionUrl, attendanceUrl } = await resolveAdminEndpoints(admin_id);
      const detectionEndpoint = enable ? `${detectionUrl}/stream/resume-all` : `${detectionUrl}/stream/stop-all`;
      const attendanceEndpoint = enable
        ? `${attendanceUrl}/api/v1/cameras/resume-all`
        : `${attendanceUrl}/api/v1/cameras/stop-all`;

      // allSettled, not all: these are two independent services, and with
      // Promise.all a single unreachable one rejected the whole call. The
      // schedule runner treats that as a total failure and leaves every
      // camera in the batch at its old state — so one sick attendance host
      // silently kept detection pipelines running past their stop time.
      const [detectionResult, attendanceResult] = await Promise.allSettled([
        axios.post(detectionEndpoint, payload, {
          headers: {
            "Content-Type": "application/json",
          },
        }),
        axios.post(attendanceEndpoint, payload, {
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ]);

      const failureDetail = (result) =>
        result?.reason?.response?.data || result?.reason?.message || "unknown error";

      if (detectionResult.status === "rejected") {
        logger.error(
          `Bulk ${enable ? "resume" : "stop"} failed on detection ` +
            `(${detectionEndpoint}): ${JSON.stringify(failureDetail(detectionResult))}`,
        );
      }
      if (attendanceResult.status === "rejected") {
        logger.error(
          `Bulk ${enable ? "resume" : "stop"} failed on attendance ` +
            `(${attendanceEndpoint}): ${JSON.stringify(failureDetail(attendanceResult))}`,
        );
      }

      // Both down means nothing changed, so surface it and let the caller
      // leave the stored state alone — the next tick retries.
      if (detectionResult.status === "rejected" && attendanceResult.status === "rejected") {
        throw detectionResult.reason;
      }

      const result = {
        detection: detectionResult.value?.data ?? null,
        attendance: attendanceResult.value?.data ?? null,
      };

      // Added ONLY on a partial failure, so the success shape is byte-identical
      // to before — callers that deep-equal or serialise this response keep
      // working, and the field's presence itself means something went wrong.
      if (detectionResult.status === "rejected") {
        result.partialFailure = "attendance-only";
      } else if (attendanceResult.status === "rejected") {
        result.partialFailure = "detection-only";
      }

      return result;
    } catch (error) {
      logger.error(
        `Error toggling cameras in bulk:`,
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  // attendance
  async registerChannel(channel, type, admin_id) {
    try {
      const nvr = await NVR.findById(channel?.nvrId);
      if (channel && type && admin_id && nvr) {
        // ! old
        // const uid = `${nvr?._id}-${channel?._id}`;
        // const rtspUrl = buildRTSPUrl(nvr, channel, "main");
        // const streamingPath = await getStreamingUrl(uid, rtspUrl);
        const streamingPath = await buildStreamingUrl(nvr, channel);
        const streamingUrl =
          APP_ENV === "cloud"
            ? `${await resolveHost(nvr?.userId)}/${streamingPath}`
            : streamingPath;

        // ! new
        // const streamingUrl = `${nvr?.domain}${channel?.streamingPath}`;

        const payload = {
          camera_id: channel?._id?.toString(),
          nvr_id: channel?.nvrId?._id?.toString(),
          admin_id: admin_id?.toString(),
          stream_url: streamingUrl,
          camera_type: type,
          camera_name: channel?.customName || channel?.name,
          pipeline_mode: "object_detection",
          detection_modes: ["face"],
        };

        const response = await this.startDetection(payload, admin_id);

        console.log("Channel registered successfully:", response);
        return response;
      }
    } catch (error) {
      logger.error("Error registering Python channel:", error);
      throw error;
    }
  }

  async handleDetectionStartStop(
    channel,
    admin_id,
    enable,
    type,
    zones,
    zone_configs,
    videoResolution,
    obstruction_threshold_sec,
    severity,
    confidence_thresholds = {},
    line_crossing_settings = {},
  ) {
    if (enable) {
      // ! old
      const nvr = await NVR.findById(channel?.nvrId?._id);
      if (!nvr) throw new Error("NVR not found");

      const detectionModes = DETECTION_MODES_MAP[type] || [];

      // const uid = `${nvr?._id}-${channel?._id}`;
      // const rtspUrl = buildRTSPUrl(nvr, channel, "main");
      // const streamingPath = await getStreamingUrl(uid, rtspUrl);
      const streamingPath = await buildStreamingUrl(nvr, channel);

      // stream_url MUST be absolute: DS fetches it directly, and a bare
      // "stream/<nvr>-<cam>/playlist.m3u8" is not fetchable from there. The old
      // check only prefixed the host when APP_ENV was "cloud", but every config
      // ships APP_ENV "local", so DS was handed a relative path on every start -
      // the pipeline came up, found nothing to read, and produced no detections.
      // Prefix whenever the path is not already absolute, whatever the env.
      const isAbsolute = /^https?:\/\//i.test(String(streamingPath || ""));
      const streamHost = String((await resolveHost(nvr?.userId)) || "").replace(/\/+$/, "");
      const streamingUrl = isAbsolute
        ? String(streamingPath)
        : `${streamHost}/${String(streamingPath || "").replace(/^\/+/, "")}`;

      // ! new
      // const streamingUrl = `${nvr?.domain}${channel?.streamingPath}`;

      // const payload = {
      //   camera_id: channel?._id?.toString(),
      //   nvr_id: channel?.nvrId?._id?.toString(),
      //   admin_id,
      //   stream_url: streamingUrl,
      //   camera_type: channel?.checkType || "",
      //   camera_name: channel?.customName || channel?.name,
      //   pipeline_mode: "object_detection",
      //   detection_modes: detectionModes,
      //   zones,
      //   videoResolution
      // };
      // return await this.startDetection(payload);
      const payload = {
        camera_id: channel?._id?.toString(),
        nvr_id: channel?.nvrId?._id?.toString(),
        admin_id,
        stream_url: streamingUrl,
        camera_type: channel?.checkType || "",
        camera_name: channel?.customName || channel?.name,
        pipeline_mode: "object_detection",
        detection_modes: detectionModes,
        zones,
        zone_configs,
        videoResolution,
        obstruction_threshold_sec,
        severity,
        confidence_thresholds,
        line_crossing_settings,
      };
      return await this.startNewDetection(payload);
    } else {
      // return await this.stopDetection(channel?._id?.toString());
      // Pass the detector modes and the admin. Without the modes the payload
      // carries no `detectors` list and DS stops the WHOLE camera, killing
      // every other detection on it. Without the admin the request goes to
      // the global default host even when this admin has its own, so the
      // stop lands on a server that is not running the pipeline.
      return await this.stopNewDetection(
        channel?._id?.toString(),
        channel?.nvrId?._id?.toString(),
        DETECTION_MODES_MAP[type] || [],
        admin_id,
      );
    }
  }

  async startNewDetection(payload) {
    try {
      const {
        camera_id,
        nvr_id,
        admin_id,
        stream_url,
        detection_modes,
        zones,
        zone_configs,
        obstruction_threshold_sec,
        severity,
        confidence_thresholds = {},
        line_crossing_settings = {},
      } = payload;

      // 🔹 Convert detection_modes → detectors
      const detectors = [];

      if (["helmet", "vest"].some((mode) => detection_modes?.includes(mode))) {
        detectors.push({
          name: "personalProtectiveEquipmentSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("crowd")) {
        detectors.push({
          name: "crowdDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("line_crossing")) {
        detectors.push({
          name: "lineCrossingSettings",
          zone_configs,
          line_coordinates: zones || [],
          severity,
          ...pickLineCrossingSettings(line_crossing_settings),
        });
      }

      if (detection_modes?.includes("vehicles")) {
        detectors.push({
          name: "countVehiclesSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("countPersons")) {
        detectors.push({
          name: "countPersonsSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
        console.log(zones, 'detectors');

      }

      if (detection_modes?.includes("ANPR")) {
        detectors.push({
          name: "numberPlateDetectionSettings",
          zone_configs,
          // obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("vehicleType")) {
        detectors.push({
          name: "vehicleTypeDetectionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("intrusion")) {
        detectors.push({
          name: "zoneIntrusionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("conveyor")) {
        detectors.push({
          name: "conveyorDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("crusher")) {
        detectors.push({
          name: "crusherDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("water_spillage")) {
        detectors.push({
          name: "waterSpillageDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }


      if (detection_modes?.includes("intrusion")) {
        detectors.push({
          name: "zoneIntrusionSettings",
          zone_configs,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("vehicleType")) {
        detectors.push({
          name: "vehicleTypeDetectionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("loitering")) {
        detectors.push({
          name: "loiteringDetectionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("vehicleObstruction")) {
        detectors.push({
          name: "vehicleObstructionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }
      if (detection_modes?.includes("tableOccupancySettings")) {

        detectors.push({
          name: "tableOccupancySettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("foodServicePPEDetection")) {
        detectors.push({
          name: "foodServicePPEDetectionSettings",
          zone_configs,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("desk_absence")) {
        detectors.push({
          name: "deskAbsenceDetectionSettings",
          zones: zones || [],
          zone_configs
        });
      }

      if (detection_modes?.includes("mobilePhoneDetection")) {
        detectors.push({
          name: "mobilePhoneDetectionSettings",
          zones: zones || [],
          zone_configs
        });
      }

      if (detection_modes?.includes("carModelDetection")) {
        detectors.push({
          name: "carModelDetectionSettings",
          zones: zones || [],
          zone_configs
        });
      }


      // ❗️ Validation
      if (!detectors.length) {
        throw new Error("No configurations found");
      }

      // 🔹 New payload (ONLY required fields)
      const detectorsWithThresholds = detectors.map((detector) => ({
        ...detector,
        ...pickDetectorThresholds(detector.name, confidence_thresholds),
        ...(detector.name === "lineCrossingSettings"
          ? pickLineCrossingSettings(line_crossing_settings)
          : {}),
      }));

      const newPayload = {
        camera_id,
        nvr_id,
        admin_id,
        detectors: detectorsWithThresholds,
      };
      // console.log('newPayload', JSON.stringify(newPayload, null, 2));

      // include stream_url only if present
      if (stream_url) {
        newPayload.stream_url = stream_url;
      }

      const { detectionUrl } = await resolveAdminEndpoints(admin_id);
      const response = await axios.post(`${detectionUrl}/stream`, newPayload, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      logger.error(
        "Error starting detection:",
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  async updateNewDetection(payload) {
    try {
      const {
        camera_id,
        nvr_id,
        admin_id,
        stream_url,
        camera_type,
        camera_name,
        pipeline_mode,
        detection_modes,
        zones,
        zone_configs,
        videoResolution,
        obstruction_threshold_sec,
        severity,
        zone_name,
        confidence_thresholds = {},
        line_crossing_settings = {},
      } = payload;

      // 🔹 Convert detection_modes → detectors
      const detectors = [];

      if (["helmet", "vest"].some((mode) => detection_modes?.includes(mode))) {
        detectors.push({
          name: "personalProtectiveEquipmentSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("crowd")) {
        detectors.push({
          name: "crowdDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("line_crossing")) {
        detectors.push({
          name: "lineCrossingSettings",
          zone_configs,
          line_coordinates: zones || [],
          severity,
          ...pickLineCrossingSettings(line_crossing_settings),
        });
      }

      if (detection_modes?.includes("vehicles")) {
        detectors.push({
          name: "countVehiclesSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("countPersons")) {
        detectors.push({
          name: "countPersonsSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("vehicle_obstruction")) {
        detectors.push({
          name: "vehicleObstructionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("intrusion")) {
        detectors.push({
          name: "zoneIntrusionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("conveyor")) {
        detectors.push({
          name: "conveyorDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("crusher")) {
        detectors.push({
          name: "crusherDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("water_spillage")) {
        detectors.push({
          name: "waterSpillageDetectionSettings",
          zone_configs,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("vehicleType")) {
        detectors.push({
          name: "vehicleTypeDetectionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("loitering")) {
        detectors.push({
          name: "loiteringDetectionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }
      if (detection_modes?.includes("vehicleObstruction")) {
        detectors.push({
          name: "vehicleObstructionSettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }
      if (detection_modes?.includes("tableOccupancySettings")) {
        detectors.push({
          name: "tableOccupancySettings",
          zone_configs,
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("desk_absence")) {
        detectors.push({
          name: "deskAbsenceDetection",
          zones: zones || [],
          zone_configs,
        });
      }

      if (detection_modes?.includes("mobilePhoneDetection")) {
        detectors.push({
          name: "mobilePhoneDetectionSettings",
          zones: zones || [],
          zone_name,
          zone_configs,
        });
      }

      if (detection_modes?.includes("carModelDetection")) {
        detectors.push({
          name: "carModelDetectionSettings",
          zones: zones || [],
          zone_configs
        });
      }

      // ❗️ Validation
      if (!detectors.length) {
        throw new Error("No configurations found");
      }

      // 🔹 New payload (ONLY required fields)
      const detectorsWithThresholds = detectors.map((detector) => ({
        ...detector,
        ...pickDetectorThresholds(detector.name, confidence_thresholds),
        ...(detector.name === "lineCrossingSettings"
          ? pickLineCrossingSettings(line_crossing_settings)
          : {}),
      }));

      const newPayload = {
        camera_id,
        nvr_id,
        admin_id,
        detectors: detectorsWithThresholds,
      };

      // include stream_url only if present
      if (stream_url) {
        newPayload.stream_url = stream_url;
      }
      console.log(JSON.stringify(newPayload));
      const { detectionUrl } = await resolveAdminEndpoints(admin_id);
      const response = await axios.post(
        `${detectionUrl}/detectors/update`,
        newPayload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      logger.error(
        "Error updating detection:",
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  async resetDetectionConfidence(payload) {
    try {
      const { camera_id, nvr_id, admin_id, detectors } = payload;
      const { detectionUrl } = await resolveAdminEndpoints(admin_id);
      const response = await axios.post(
        `${detectionUrl}/detectors/reset-confidence`,
        {
          camera_id,
          nvr_id,
          detectors,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      logger.error(
        "Error resetting detection confidence:",
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  async handleDetectionUpdate(
    channel,
    admin_id,
    type,
    zones,
    videoResolution,
    zone_configs,
    obstruction_threshold_sec,
    severity,
    zoneName,
    confidence_thresholds = {},
    line_crossing_settings = {},
  ) {
    const nvr = await NVR.findById(channel?.nvrId?._id);
    if (!nvr) throw new Error("NVR not found");

    const detectionModes = DETECTION_MODES_MAP[type] || [];

    const streamingPath = await buildStreamingUrl(nvr, channel);
    const streamingUrl =
      APP_ENV === "cloud" ? `${await resolveHost(nvr?.userId)}/${streamingPath}` : streamingPath;

    const payload = {
      camera_id: channel?._id?.toString(),
      nvr_id: channel?.nvrId?._id?.toString(),
      admin_id,
      stream_url: streamingUrl,
      camera_type: channel?.checkType || "",
      camera_name: channel?.customName || channel?.name,
      pipeline_mode: "object_detection",
      detection_modes: detectionModes,
      zones,
      zone_configs,
      videoResolution,
      obstruction_threshold_sec,
      severity,
      zoneName,
      confidence_thresholds,
      line_crossing_settings,
    };
    return await this.updateNewDetection(payload);
  }

  /**
   * Which detectors DS is ACTUALLY running on a camera right now.
   *
   * Read-only. Our stored `enabled` flag is only the last state we believe we
   * set; when a start silently failed, that flag says running while DS has
   * nothing — and because the runner is idempotent against its own flag, it
   * never retries. Asking DS is the only way out of that.
   *
   * Returns null (not an empty list) when the state cannot be determined, so
   * callers can tell "DS says nothing is running" from "DS did not answer"
   * and avoid acting on a failed probe.
   */
  async getCameraActiveLogics(camera_id, admin_id) {
    try {
      const { detectionUrl } = await resolveAdminEndpoints(admin_id);
      const response = await axios.get(
        `${detectionUrl}/stream/${camera_id}/status`,
        { timeout: 8000 },
      );
      const logics = response?.data?.active_logics;
      return Array.isArray(logics) ? logics : [];
    } catch (error) {
      // 404 is a definite answer: DS has no pipeline for this camera at all.
      if (error?.response?.status === 404) return [];
      logger.error(
        `Could not read DS status for camera ${camera_id}: ` +
          `${error?.response?.data ? JSON.stringify(error.response.data) : error?.message}`,
      );
      return null;
    }
  }

  /**
   * Fetch the detector names DS actually accepts.
   *
   * DS is a FastAPI app that has never disabled `openapi_url`, so its full
   * schema — including the `DetectionLogic` enum that every detector name is
   * validated against — is already served at /openapi.json. That is the
   * authoritative list, live, with no work required on the DS side.
   *
   * A purpose-built catalog endpoint is tried first in case DS ever adds one
   * (path configurable via `detection.detectorCatalogPath`); OpenAPI is the
   * fallback that works today. Returns null when neither answers, so callers
   * can tell "DS said nothing" from "DS returned an empty list".
   */
  async fetchDsDetectorNames(admin_id) {
    const { detectionUrl } = await resolveAdminEndpoints(admin_id);

    const catalogPath = config.has("detection.detectorCatalogPath")
      ? config.get("detection.detectorCatalogPath")
      : "/detectors";

    // 1. A dedicated catalog endpoint, if DS ever grows one.
    try {
      const { data } = await axios.get(`${detectionUrl}${catalogPath}`, { timeout: 8000 });
      const list = Array.isArray(data) ? data : data?.detectors;
      if (Array.isArray(list) && list.length) {
        return {
          source: catalogPath,
          names: list.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean),
        };
      }
    } catch {
      // Expected — DS exposes no such endpoint today.
    }

    // 2. OpenAPI. The enum lives at components.schemas.DetectionLogic.enum.
    try {
      const { data } = await axios.get(`${detectionUrl}/openapi.json`, { timeout: 8000 });
      const names = data?.components?.schemas?.DetectionLogic?.enum;
      if (Array.isArray(names) && names.length) {
        return { source: "/openapi.json", names };
      }
      logger.debug("[DS] openapi.json carried no DetectionLogic enum");
    } catch (error) {
      logger.debug(
        `[DS] openapi.json unavailable: ${error?.response?.status || error.message}`,
      );
    }

    return null;
  }

  /**
   * Reconcile DS_DETECTOR_BY_MODE against what DS accepts, so a name we send
   * that DS does not know is caught here instead of silently failing request
   * validation later, and so modes with no DS detector at all are reported.
   *
   * Never throws — it runs on boot and from the superadmin's Sync button.
   */
  async syncDsDetectorNames(admin_id) {
    const fetched = await this.fetchDsDetectorNames(admin_id);
    if (!fetched) {
      logger.debug("[DS] detector names unavailable — skipping reconciliation");
      return null;
    }

    const known = new Set(fetched.names);
    const ours = new Set(Object.values(DS_DETECTOR_BY_MODE).filter(Boolean));

    const weSendButDsRejects = [...ours].filter((name) => !known.has(name));
    const dsHasButWeNeverSend = [...known].filter((name) => !ours.has(name));
    // Modes with no DS name on our side. If DS also offers nothing spare, the
    // detector genuinely does not exist there — it is not a mapping oversight.
    const stillUnnamed = Object.entries(DS_DETECTOR_BY_MODE)
      .filter(([, name]) => !name)
      .map(([mode]) => mode);

    if (weSendButDsRejects.length) {
      logger.error(
        `[DS] names DS does not recognise: ${weSendButDsRejects.join(", ")} — ` +
          `those calls will fail validation. Fix DS_DETECTOR_BY_MODE.`,
      );
    }
    if (stillUnnamed.length) {
      logger.warn(
        `[DS] modes with no detector: ${stillUnnamed.join(", ")}. ` +
          (dsHasButWeNeverSend.length
            ? `DS offers unused: ${dsHasButWeNeverSend.join(", ")}.`
            : `DS offers nothing unused — it does not implement these.`),
      );
    }
    if (!weSendButDsRejects.length && !stillUnnamed.length) {
      logger.info(`[DS] detector names reconciled via ${fetched.source} — ${ours.size} in sync`);
    }

    return {
      source: fetched.source,
      dsNames: [...known],
      weSendButDsRejects,
      dsHasButWeNeverSend,
      stillUnnamed,
    };
  }

  async stopNewDetection(camera_id, nvr_id, detectionModes = [], admin_id) {
    try {
      // 🔹 Convert detectionModes → detectors (names expected by DS).
      // Sourced from DS_DETECTOR_BY_MODE so start and stop cannot drift apart,
      // and so adopting a name DS adds is a one-line data change.
      const { detectors, unmapped } = dsDetectorsForModes(detectionModes);

      if (unmapped.length) {
        logger.warn(
          `[DS] no detector name for mode(s) [${unmapped.join(", ")}] — ` +
            `see DS_DETECTOR_BY_MODE`,
        );
      }

      // 🔹 Build payload
      const payload = {
        camera_id,
        nvr_id,
      };

      // 👉 Only add detectors if you want partial stop
      if (detectors.length) {
        payload.detectors = detectors;
      } else if (detectionModes?.length) {
        // Modes were supplied but none resolved to a DS name, so `detectors` is
        // empty — and an empty list means "stop the WHOLE camera", killing every
        // other detection running on it.
        //
        // That is a caller asking to stop ONE detector and silently taking the
        // camera down instead. Fail loudly: not stopping one engine is far less
        // damaging than stopping five the client is still licensed for, and both
        // callers (toggleDetection, revokeDetectionEverywhere) record the
        // failure while still persisting the intended state.
        //
        // Fix by filling the name into DS_DETECTOR_BY_MODE once DS supplies it.
        throw new Error(
          `No DS detector mapping for detection_modes [${detectionModes.join(", ")}] — ` +
            `refusing to send a camera-wide stop for camera ${camera_id}. ` +
            `Add the name to DS_DETECTOR_BY_MODE.`,
        );
      }

      // Per-admin endpoint, matching startNewDetection. Using the global
      // config default here meant an admin with a custom detectionUrl had its
      // detections started on one host and stopped on another — so they never
      // actually stopped.
      const { detectionUrl } = await resolveAdminEndpoints(admin_id);

      const response = await axios.post(
        `${detectionUrl}/stream/stop`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      logger.error(
        "Error stopping detection:",
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  // to start detections
  async startDetection(payload, adminId) {
    try {
      const { attendanceUrl } = await resolveAdminEndpoints(adminId);
      const response = await axios.post(
        `${attendanceUrl}/api/v1/cameras/start`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      logger.error("Error starting Python detection:", error);
      throw error;
    }
  }
  async stopDetection(camera_id, adminId) {
    try {
      const payload = {
        camera_id,
        force: true,
      };
      const { attendanceUrl } = await resolveAdminEndpoints(adminId);
      const response = await axios.post(
        `${attendanceUrl}/api/v1/cameras/stop`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      logger.error("Error stopping Python detection:", error);
      throw error;
    }
  }

  async deregisterChannel(channel) {
    try {
    } catch (error) {
      logger.error("Error deregistering Python channel:", error);
    }
  }
  async checkChannelHealth(channel) {
    try {
    } catch (error) {
      logger.error("Error checking Python channel health:", error);
    }
  }
}

export default new PythonService();
