import logger from "../utils/logger.js";
import getStreamingUrl, {
  buildRTSPUrl,
  buildStreamingUrl,
} from "../utils/rtspStream.js";
import config from "config";
import NVR from "../core/v1/NVR/nvr.model.js";
import axios from "axios";
import { DETECTION_MODES_MAP } from "../constants/detectionTypes.js";
const streamHost = config.get("RTSPStream.host");
const attendanceHost = config.get("PythonService.attendanceUrl");
const detectionHost = config.get("PythonService.detectionUrl");
const APP_ENV = config.get("APP_ENV");

class PythonService {
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
            ? `${streamHost}/${streamingPath}`
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

        const response = await this.startDetection(payload);

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
      const streamingUrl =
        APP_ENV === "cloud" ? `${streamHost}/${streamingPath}` : streamingPath;

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
      };
      return await this.startNewDetection(payload);
    } else {
      // return await this.stopDetection(channel?._id?.toString());
      return await this.stopNewDetection(
        channel?._id?.toString(),
        channel?.nvrId?._id?.toString(),
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
      } = payload;

      // 🔹 Convert detection_modes → detectors
      const detectors = [];

      if (["helmet", "vest"].some((mode) => detection_modes?.includes(mode))) {
        detectors.push({
          name: "personalProtectiveEquipmentSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("crowd")) {
        detectors.push({
          name: "crowdDetectionSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("line_crossing")) {
        detectors.push({
          name: "lineCrossingSettings",
          line_coordinates: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("vehicles")) {
        detectors.push({
          name: "countVehiclesSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("countPersons")) {
        detectors.push({
          name: "countPersonsSettings",
          zones: zones || [],
          severity,
        });
        console.log(zones,'detectors');
        
      }

      if (detection_modes?.includes("ANPR")) {
        detectors.push({
          name: "numberPlateDetectionSettings",
          // obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("vehicleType")) {
        detectors.push({
          name: "vehicleTypeDetectionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("intrusion")) {
        detectors.push({
          name: "zoneIntrusionSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("conveyor")) {
        detectors.push({
          name: "conveyorDetectionSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("crusher")) {
        detectors.push({
          name: "crusherDetectionSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("water_spillage")) {
        detectors.push({
          name: "waterSpillageDetectionSettings",
          zones: zones || [],
          severity,
        });
      }


      if (detection_modes?.includes("intrusion")) {
        detectors.push({
          name: "zoneIntrusionSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("vehicleType")) {
        detectors.push({
          name: "vehicleTypeDetectionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if( detection_modes?.includes("loitering")) {
        detectors.push({
          name: "loiteringDetectionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("vehicleObstruction")) {
        detectors.push({
          name: "vehicleObstructionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }
      if( detection_modes?.includes("tableOccupancySettings")) {
        
        detectors.push({
          name: "tableOccupancySettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if( detection_modes?.includes("foodServicePPEDetection")) {
        detectors.push({
          name: "foodServicePPEDetection",
          zones: zones || [],
        });
      }

      if( detection_modes?.includes("desk_absence")) {
        detectors.push({
          name: "deskAbsenceDetection",
          zones: zones || [],
          zone_configs
        });
      }  

      // ❗️ Validation
      if (!detectors.length) {
        throw new Error("No configurations found");
      }

      // 🔹 New payload (ONLY required fields)
      const newPayload = {
        camera_id,
        nvr_id,
        admin_id,
        detectors,
      };      
      // include stream_url only if present
      if (stream_url) {
        newPayload.stream_url = stream_url;
      }

      const response = await axios.post(`${detectionHost}/stream`, newPayload, {
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
        detection_modes,
        zones,
        zone_configs,
        obstruction_threshold_sec,
        severity,
      } = payload;

      // 🔹 Convert detection_modes → detectors
      const detectors = [];

      if (["helmet", "vest"].some((mode) => detection_modes?.includes(mode))) {
        detectors.push({
          name: "personalProtectiveEquipmentSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("crowd")) {
        detectors.push({
          name: "crowdDetectionSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("line_crossing")) {
        detectors.push({
          name: "lineCrossingSettings",
          line_coordinates: zones || [],
        });
      }

      if (detection_modes?.includes("vehicles")) {
        detectors.push({
          name: "countVehiclesSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("countPersons")) {
        detectors.push({
          name: "countPersonsSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("vehicle_obstruction")) {
        detectors.push({
          name: "vehicleObstructionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("intrusion")) {
        detectors.push({
          name: "zoneIntrusionSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("conveyor")) {
        detectors.push({
          name: "conveyorDetectionSettings",
          zones: zones || [],
        });
      }

      if (detection_modes?.includes("crusher")) {
        detectors.push({
          name: "crusherDetectionSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("water_spillage")) {
        detectors.push({
          name: "waterSpillageDetectionSettings",
          zones: zones || [],
          severity,
        });
      }

      if (detection_modes?.includes("vehicleType")) {
        detectors.push({
          name: "vehicleTypeDetectionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if( detection_modes?.includes("loitering")) {
        detectors.push({
          name: "loiteringDetectionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }
      if (detection_modes?.includes("vehicleObstruction")) {
        detectors.push({
          name: "vehicleObstructionSettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }
      if( detection_modes?.includes("tableOccupancySettings")) {
        detectors.push({
          name: "tableOccupancySettings",
          obstruction_threshold_sec: obstruction_threshold_sec,
          zones: zones || [],
        });
      }

      if( detection_modes?.includes("desk_absence")) {
        detectors.push({
          name: "deskAbsenceDetection",
          zones: zones || [],
          zone_configs,
        });
      }


      // ❗️ Validation
      if (!detectors.length) {
        throw new Error("No configurations found");
      }

      // 🔹 New payload (ONLY required fields)
      const newPayload = {
        camera_id,
        nvr_id,
        admin_id,
        detectors,
      };

      // include stream_url only if present
      if (stream_url) {
        newPayload.stream_url = stream_url;
      }
      console.log(JSON.stringify(newPayload));
      const response = await axios.post(
        `${detectionHost}/detectors/update`,
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

  async handleDetectionUpdate(
    channel,
    admin_id,
    type,
    zones,
    zone_configs,
    videoResolution,
    obstruction_threshold_sec,
    severity,
  ) {
    const nvr = await NVR.findById(channel?.nvrId?._id);
    if (!nvr) throw new Error("NVR not found");

    const detectionModes = DETECTION_MODES_MAP[type] || [];

    const streamingPath = await buildStreamingUrl(nvr, channel);
    const streamingUrl =
      APP_ENV === "cloud" ? `${streamHost}/${streamingPath}` : streamingPath;

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
    };
    return await this.updateNewDetection(payload);
  }

  async stopNewDetection(camera_id, nvr_id, detectionModes = []) {
    try {
      // 🔹 Convert detectionModes → detectors (names expected by API)
      const detectors = [];

      if (["helmet", "vest"].some((mode) => detectionModes?.includes(mode))) {
        detectors.push("personalProtectiveEquipmentSettings");
      }

      if (detectionModes?.includes("crowd")) {
        detectors.push("crowdDetectionSettings");
      }

      if (detectionModes?.includes("line_crossing")) {
        detectors.push("lineCrossingSettings");
      }

      if (detectionModes?.includes("vehicles")) {
        detectors.push("countVehiclesSettings");
      }

      if (detectionModes?.includes("countPersons")) {
        detectors.push("countPersonsSettings");
      }

      if (detectionModes?.includes("vehicleObstruction")) {
        detectors.push("vehicleObstructionSettings");
      }

      if (detectionModes?.includes("intrusion")) {
        detectors.push("zoneIntrusionSettings");
      }

      if (detectionModes?.includes("conveyor")) {
        detectors.push("conveyorDetectionSettings");
      }

      if (detectionModes?.includes("crusher")) {
        detectors.push("crusherDetectionSettings");
      }

      if (detectionModes?.includes("water_spillage")) {
        detectors.push("waterSpillageDetectionSettings");
      }

      if (detectionModes?.includes("ANPR")) {
        detectors.push("numberPlateDetectionSettings");
      }

      if( detectionModes?.includes("loitering")) {
        detectors.push("loiteringDetectionSettings");
      }

      if (detectionModes?.includes("vehicleType")) {
        detectors.push("vehicleTypeDetectionSettings");
      }
      if( detectionModes?.includes("loitering")) {
        detectors.push("loiteringDetectionSettings");
      }
      if( detectionModes?.includes("vehicleObstruction")) {
        detectors.push("vehicleObstructionSettings");
      }
      if( detectionModes?.includes("tableOccupancySettings")) {
        detectors.push("tableOccupancyDetectionSettings");
      }

      if( detectionModes?.includes("desk_absence")) {
        detectors.push("deskAbsenceSettings");
      }
      // 🔹 Build payload
      const payload = {
        camera_id,
        nvr_id,
      };

      // 👉 Only add detectors if you want partial stop
      if (detectors.length) {
        payload.detectors = detectors;
      }

      const response = await axios.post(
        `${detectionHost}/stream/stop`,
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
  async startDetection(payload) {
    try {
      const response = await axios.post(
        `${attendanceHost}/api/v1/cameras/start`,
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
  async stopDetection(camera_id) {
    try {
      const payload = {
        camera_id,
        force: true,
      };
      const response = await axios.post(
        `${attendanceHost}/api/v1/cameras/stop`,
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
