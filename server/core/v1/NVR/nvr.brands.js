import DigestFetch from "digest-fetch";
import { parseXml } from "../../../utils/xmlParse.js";
import NVR from "./nvr.model.js";
import Camera from "../channels/channels.model.js";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import {
  buildRTSPUrl,
  registerCameraStream,
} from "../../../utils/rtspStream.js";
import { decrypt } from "../../../utils/cryptoUtils.js";
import { nanoid } from "nanoid";
import { autoSyncLocations } from "../../../utils/helperFunctions.js";

async function handleHikvisionRegistration(req, res) {
  const {
    ip,
    username,
    password,
    port,
    rtspPort,
    nvrName,
    location = "",
  } = req.body;
  const user_id = req?.verified?.userData?.user_id;

  try {
    const client = new DigestFetch(username, password);

    // 1. Get NVR Device Info
    const deviceInfoRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/System/deviceInfo`
    );
    if (!deviceInfoRes.ok) {
      logger.error(
        "Hikvision NVR Authentication failed",
        JSON.stringify(deviceInfoRes)
      );
      return res
        .status(400)
        .json(
          Response.userFailResp(
            "NVR Authentication failed",
            "NVR Authentication failed"
          )
        );
    }

    const deviceInfoXml = await deviceInfoRes.text();
    const deviceInfoData = await parseXml(deviceInfoXml);
    const deviceInfo = deviceInfoData?.DeviceInfo;

    const savedNVR = await NVR.create({
      userId: user_id,
      ip,
      username,
      password,
      port,
      rtspPort,
      nvrName,
      brand: "hikvision",
      deviceName: deviceInfo?.deviceName,
      model: deviceInfo?.model,
      serialNumber: deviceInfo?.serialNumber,
      macAddress: deviceInfo?.macAddress,
      firmwareVersion: deviceInfo?.firmwareVersion,
      deviceType: deviceInfo?.deviceType,
      location,
    });

    // 2. Get Camera Channel Info
    const channelsRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels`
    );
    const channelsXml = await channelsRes.text();
    const channelsData = await parseXml(channelsXml);
    const channelList = channelsData?.InputProxyChannelList?.InputProxyChannel;
    const channels = Array.isArray(channelList) ? channelList : [channelList];

    // 3. Get Streaming Status Info
    const statusRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels/status`
    );
    const statusXml = await statusRes.text();
    const statusData = await parseXml(statusXml);
    const statusList =
      statusData?.InputProxyChannelStatusList?.InputProxyChannelStatus;
    const statuses = Array.isArray(statusList) ? statusList : [statusList];

    // 4. 🔄 Get all stream resolution info at once
    const streamInfoRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/Streaming/channels/`
    );
    const streamInfoXml = await streamInfoRes.text();
    const streamInfoData = await parseXml(streamInfoXml);
    const streamingChannelList =
      streamInfoData?.StreamingChannelList?.StreamingChannel;
    const streamingChannels = Array.isArray(streamingChannelList)
      ? streamingChannelList
      : [streamingChannelList];

    // 🗺️ Map stream ID to resolution
    const streamResolutionMap = {};
    for (const stream of streamingChannels) {
      const id = stream?.id;
      const width = stream?.Video?.videoResolutionWidth;
      const height = stream?.Video?.videoResolutionHeight;
      if (id && width && height) {
        streamResolutionMap[id] = {
          width: parseInt(width, 10),
          height: parseInt(height, 10),
        };
      }
    }

    // 5. Loop through channels to save each camera
    const cameraResults = [];

    for (const ch of channels) {
      const chId = ch.id;
      const status = statuses.find((s) => s.id === chId);
      const streamIds =
        status?.streamingProxyChannelIdList?.streamingProxyChannelId || [];

      // 🔐 Skip if no streamIds
      if (streamIds.length === 0) continue;

      const rtspChannels = streamIds.map((id) => {
        return {
          id,
          resolution: streamResolutionMap[id] || { width: 0, height: 0 },
        };
      });

      const savedCam = await Camera.create({
        nvrId: savedNVR._id,
        userId: user_id,
        channelId: chId,
        rtspChannels,
        name: ch?.name || "",
        ipAddress: ch?.sourceInputPortDescriptor?.ipAddress || "",
        model: ch?.sourceInputPortDescriptor?.model || "",
        serialNumber: ch?.sourceInputPortDescriptor?.serialNumber || "",
        firmwareVersion: ch?.sourceInputPortDescriptor?.firmwareVersion || "",
        streamEndpoint: "/Streaming/Channels/",
      });

      const uid = `${savedNVR._id}-${savedCam._id}`;
      const rtspUrl = buildRTSPUrl(savedNVR, savedCam, "main");

      // Register camera stream
      registerCameraStream(uid, rtspUrl);

      cameraResults.push(savedCam);
    }

    // ✅ Save cameraCount in the NVR
    await NVR.findByIdAndUpdate(savedNVR._id, {
      cameraCount: cameraResults.length,
    });

    // Auto-sync locations in background
    autoSyncLocations(
      { _id: req?.verified?.userData?.adminId }, 
      { user_id }
    ).catch(e => logger.error("Post-NVR registration sync failed", e));

    return res.status(201).json(
      Response.userSuccessResp(
        "Hikvision NVR and channels registered successfully",
        {
          nvr: { ...savedNVR?._doc, cameraCount: cameraResults.length },
          channels: cameraResults,
        }
      )
    );
  } catch (error) {
    logger.error("Hikvision Register NVR Error:", error);
    const isDuplicateError = error?.message?.includes("E11000");
    const errMsg = isDuplicateError
      ? "NVR already exists"
      : error.message || "Unknown error";
    return res
      .status(500)
      .json(Response.errorResp("NVR registration failed", errMsg));
  }
}

// Utility function to parse CP Plus plain text response
function parseCPPlusResponse(text) {
  const lines = text.split("\n");
  const result = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && trimmed.includes("=")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("="); // Handle values with '=' in them
      result[key.trim()] = value.trim();
    }
  });

  return result;
}

// Helper to group array properties from CP Plus response
function groupArrayProperties(data, prefix) {
  const groups = {};

  Object.keys(data).forEach((key) => {
    if (key.startsWith(prefix)) {
      const match = key.match(/\[(\d+)\](?:\[(\d+)\])?\.?(.+)?/);
      if (match) {
        const index1 = match[1];
        const index2 = match[2];
        const property = match[3];

        const groupKey = index2 ? `${index1}_${index2}` : index1;

        if (!groups[groupKey]) {
          groups[groupKey] = {
            channel: index1,
            stream: index2,
          };
        }

        if (property) {
          groups[groupKey][property] = data[key];
        }
      }
    }
  });

  return Object.values(groups);
}

function groupRemoteDeviceProperties(data) {
  const groups = {};

  Object.keys(data).forEach((key) => {
    if (!key.startsWith("table.RemoteDevice.")) return;

    // Extract index from uuid:System_CONFIG_NETCAMERA_INFO_XX
    const match = key.match(/uuid:System_CONFIG_NETCAMERA_INFO_(\d+)\.(.+)$/);

    if (!match) return;

    const index = match[1]; // camera index
    const property = match[2]; // Address, Mac, SerialNo, etc

    if (!groups[index]) {
      groups[index] = {
        channel: index,
      };
    }

    groups[index][property] = data[key];
  });

  return Object.values(groups);
}

async function handleCPPlusRegistration(req, res) {
  const {
    ip,
    username,
    password,
    port = 80,
    rtspPort = 554,
    nvrName,
    location = "",
  } = req.body;
  const user_id = req?.verified?.userData?.user_id || 5;

  try {
    const client = new DigestFetch(username, password);

    // 1. Get NVR Device Info
    const deviceInfoRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/magicBox.cgi?action=getSystemInfo`
    );

    if (!deviceInfoRes.ok) {
      logger.error(
        "CP Plus NVR Authentication failed",
        JSON.stringify(deviceInfoRes)
      );
      return res
        .status(400)
        .json(
          Response.userFailResp(
            "NVR Authentication failed",
            "NVR Authentication failed"
          )
        );
    }

    const deviceInfoText = await deviceInfoRes.text();
    const deviceInfoData = parseCPPlusResponse(deviceInfoText);

    // Log the actual response to debug
    logger.info("CP Plus Device Info Response:", deviceInfoData);

    // Extract device info with fallbacks to prevent undefined values
    const savedNVR = await NVR.create({
      userId: user_id,
      ip,
      username,
      password,
      port,
      rtspPort,
      nvrName,
      brand: "cpplus",
      deviceName:
        deviceInfoData["deviceName"] ||
        deviceInfoData["DeviceName"] ||
        deviceInfoData["updateSerial"] ||
        nvrName ||
        "",
      model:
        deviceInfoData["deviceModel"] ||
        deviceInfoData["DeviceType"] ||
        deviceInfoData["deviceType"] ||
        deviceInfoData["updateSerial"] ||
        "",
      serialNumber:
        deviceInfoData["serialNumber"] || deviceInfoData["SerialNo"] || "",
      macAddress:
        deviceInfoData["macAddress"] || deviceInfoData["MacAddress"] || "",
      firmwareVersion:
        deviceInfoData["softwareVersion"] ||
        deviceInfoData["SoftwareVersion"] ||
        deviceInfoData["processor"] ||
        "",
      deviceType:
        deviceInfoData["deviceClass"] ||
        deviceInfoData["DeviceClass"] ||
        deviceInfoData["deviceType"] ||
        "",
      location: location || "",
    });

    const channelTitlesRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`
    );
    const channelTitlesText = await channelTitlesRes.text();
    const channelTitlesData = parseCPPlusResponse(channelTitlesText);

    // Parse channel names
    const channelNames = {};
    Object.keys(channelTitlesData).forEach((key) => {
      // Match pattern: table.ChannelTitle[0].Name
      const match = key.match(/table\.ChannelTitle\[(\d+)\]\.Name/);
      if (match) {
        const channelIdx = match[1];
        channelNames[channelIdx] = channelTitlesData[key];
      }
    });

    // 2. Get Camera Channel Info
    const channelsRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=VideoInOptions`
    );
    const channelsText = await channelsRes.text();
    const channelsData = parseCPPlusResponse(channelsText);

    // Group channels by index
    const channelGroups = groupArrayProperties(
      channelsData,
      "table.VideoInOptions["
    );

    // 3. Get Video Encode Config (for resolution info)
    const encodeRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=Encode`
    );
    const encodeText = await encodeRes.text();
    const encodeData = parseCPPlusResponse(encodeText);

    // 4. Parse encoding settings per channel
    const encodeGroups = {};

    Object.keys(encodeData).forEach((key) => {
      // Match patterns like: table.Encode[0].MainFormat[0].Video.Width
      const match = key.match(
        /table\.Encode\[(\d+)\]\.(MainFormat|ExtraFormat)\[(\d+)\]\.Video\.(Width|Height|Compression|BitRate|FPS)/
      );

      if (match) {
        const channelIdx = match[1];
        const streamType = match[2]; // MainFormat or ExtraFormat
        const streamIdx = match[3];
        const property = match[4];

        const streamKey = `${channelIdx}_${streamType}_${streamIdx}`;

        if (!encodeGroups[streamKey]) {
          encodeGroups[streamKey] = {
            channel: channelIdx,
            streamType,
            streamIdx,
            id: `${parseInt(channelIdx) + 1}${
              streamType === "MainFormat" ? "01" : "02"
            }`,
          };
        }

        if (property === "Width") {
          encodeGroups[streamKey].width = parseInt(encodeData[key], 10);
        } else if (property === "Height") {
          encodeGroups[streamKey].height = parseInt(encodeData[key], 10);
        } else {
          encodeGroups[streamKey][property.toLowerCase()] = encodeData[key];
        }
      }
    });

    const remoteRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=RemoteDevice`
    );

    const remoteText = await remoteRes.text();

    const remoteData = parseCPPlusResponse(remoteText);

    const remoteGroups = groupRemoteDeviceProperties(remoteData);

    // 5. Loop through channels to save each camera
    const cameraResults = [];

    for (const chGroup of channelGroups) {
      const chId = chGroup.channel;

      // Get streams for this channel
      const channelStreams = Object.values(encodeGroups).filter(
        (stream) => stream.channel === chId && stream.width && stream.height
      );

      if (channelStreams.length === 0) continue;

      const rtspChannels = channelStreams.map((stream) => ({
        id: stream.id,
        resolution: {
          width: stream.width || 0,
          height: stream.height || 0,
        },
      }));

      // Get the actual camera name from ChannelTitle
      const cameraName =
        channelNames[chId] ||
        chGroup.Alias ||
        chGroup.Name ||
        `Camera ${parseInt(chId) + 1}`;

      const remoteDevice = remoteGroups.find(
        (rd) => rd.Channel === chId || rd.channel === chId
      );

      const savedCam = await Camera.create({
        nvrId: savedNVR._id,
        userId: user_id,
        channelId: (parseInt(chId) + 1).toString(),
        rtspChannels,
        name: cameraName,
        ipAddress: chGroup?.IPAddress || remoteDevice?.Address || "",
        model: chGroup?.Model || remoteDevice?.Model || "",
        serialNumber: chGroup?.SerialNumber || remoteDevice?.SerialNo || "",
        firmwareVersion:
          chGroup?.FirmwareVersion || remoteDevice?.FirmwareVersion || "",
        streamEndpoint: "/cam/realmonitor",
      });

      const uid = `${savedNVR._id}-${savedCam._id}`;
      const rtspUrl = buildRTSPUrl(savedNVR, savedCam, "main");

      // Register camera stream
      await registerCameraStream(uid, rtspUrl);

      cameraResults.push(savedCam);
    }

    // 6. Save cameraCount in the NVR
    await NVR.findByIdAndUpdate(savedNVR._id, {
      cameraCount: cameraResults.length,
    });

    // Auto-sync locations in background
    autoSyncLocations(
      { _id: req?.verified?.userData?.adminId }, 
      { user_id }
    ).catch(e => logger.error("Post-NVR registration sync failed", e));

    return res.status(201).json(
      Response.userSuccessResp(
        "CP Plus NVR and channels registered successfully",
        {
          nvr: { ...savedNVR?._doc, cameraCount: cameraResults.length },
          channels: cameraResults,
        }
      )
    );
  } catch (error) {
    logger.error("CP Plus Register NVR Error:", error);
    const isDuplicateError = error?.message?.includes("E11000");
    const errMsg = isDuplicateError
      ? "NVR already exists"
      : error.message || "Unknown error";
    return res
      .status(500)
      .json(Response.errorResp("NVR registration failed", errMsg));
  }
}

// Helper function to parse resolution codes
function parseResolution(resCode) {
  const resolutionMap = {
    D1: { width: 704, height: 576 },
    "720P": { width: 1280, height: 720 },
    "1080P": { width: 1920, height: 1080 },
    "3M": { width: 2048, height: 1536 },
    "4M": { width: 2592, height: 1520 },
    "5M": { width: 2560, height: 1920 },
    "8M": { width: 3840, height: 2160 },
  };
  return resolutionMap[resCode] || { width: 0, height: 0 };
}

async function handleSingleCameraRegistration(req, res) {
  try {
    const user_id = req?.verified?.userData?.user_id;
    const {
      ip,
      username,
      password,
      port,
      rtspPort,
      nvrName,
      location = "",
      brand = "camera",
      streamEndpoint = "",
    } = req.body;
    const savedNVR = await NVR.create({
      userId: user_id,
      ip,
      username,
      password,
      port,
      rtspPort,
      nvrName,
      brand,
      deviceName: "",
      model: "",
      serialNumber: "",
      macAddress: "",
      firmwareVersion: "",
      deviceType: "",
      location,
    });
    const id = nanoid();
    const savedCam = await Camera.create({
      nvrId: savedNVR._id,
      userId: user_id,
      channelId: "",
      rtspChannels: [],
      name: `Cam-${id}`,
      ipAddress: ip,
      model: "",
      serialNumber: "",
      firmwareVersion: "",
      streamEndpoint,
    });

    const uid = `${savedNVR._id}-${savedCam._id}`;
    const rtspUrl = buildRTSPUrl(savedNVR, savedCam, "main");

    registerCameraStream(uid, rtspUrl);

    await NVR.findByIdAndUpdate(savedNVR._id, {
      cameraCount: 1,
    });

    // Auto-sync locations in background
    autoSyncLocations(
      { _id: req?.verified?.userData?.adminId }, 
      { user_id }
    ).catch(e => logger.error("Post-NVR registration sync failed", e));

    return res
      .status(201)
      .json(Response.userSuccessResp("Camera registered successfully", {}));
  } catch (error) {
    logger.error("Single Camera Registration Error:", error);
    return res
      .status(500)
      .json(Response.errorResp("Camera registration failed", error.message));
  }
}

// ─── Tiandy Auth Helpers ────────────────────────────────────────────────────

async function tiandyLogin(ip, port, username, password) {
  const { createHash } = await import("crypto");

  // Step 1: GET SessionCheck — public endpoint, returns session/key/iterations
  const scRes = await fetch(
    `http://${ip}:${port}/CGI/Security/SessionCheck?timeStamp=${Date.now()}`,
    { headers: { "If-Modified-Since": "0" } }
  );
  if (!scRes.ok) throw new Error("Tiandy SessionCheck failed");

  const scXml = await scRes.text();
  const extract = (tag) => (scXml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";

  const session    = extract("session");
  const key        = extract("key");
  const iterations = parseInt(extract("iterations")) || 10;

  // Tiandy NVR password fields are capped at 15 chars — trim to match what NVR stored
  const effectivePassword = password.slice(0, 15);

  // Step 2: Compute SHA256 hash chain (matches Tiandy JS GetSessionPW logic)
  let hash = createHash("sha256").update(username + effectivePassword).digest("hex").toUpperCase();
  for (let i = 0; i < iterations; i++) {
    hash = createHash("sha256").update(hash + key).digest("hex").toUpperCase();
  }

  // Step 3: POST Logon XML
  const loginXml = `<User><username>${username}</username><passwd>${hash}</passwd><sessionTmp>${session}</sessionTmp></User>`;
  const logonRes = await fetch(
    `http://${ip}:${port}/CGI/Security/Logon?timeStamp=${Date.now()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "If-Modified-Since": "0",
      },
      body: loginXml,
    }
  );

  const logonXml = await logonRes.text();
  const statusValue = (logonXml.match(/<statusValue>([^<]+)<\/statusValue>/) || [])[1];
  const activeSession = (logonXml.match(/<session>([^<]+)<\/session>/) || [])[1] || "";

  if (statusValue !== "200" || !activeSession) {
    const passwdLeft = (logonXml.match(/<passwdLeftValue>([^<]+)<\/passwdLeftValue>/) || [])[1];
    throw new Error(`Tiandy login failed (status ${statusValue}, attempts left: ${passwdLeft})`);
  }

  return activeSession; // Use as HttpSession header for all subsequent requests
}

async function tiandyGet(ip, port, path, sessionToken) {
  const res = await fetch(`http://${ip}:${port}${path}`, {
    headers: {
      HttpSession: sessionToken,
      "If-Modified-Since": "0",
    },
  });
  return res;
}

// ─── Tiandy Registration Handler ────────────────────────────────────────────

async function handleTiandyRegistration(req, res) {
  const {
    ip,
    username,
    password,
    port = 8181,
    rtspPort = 554,
    nvrName,
    location = "",
  } = req.body;
  const user_id = req?.verified?.userData?.user_id;

  try {
    // Step 1: Login — SessionCheck → SHA256 hash → Logon
    let sessionToken;
    try {
      sessionToken = await tiandyLogin(ip, port, username, password);
    } catch (authErr) {
      return res.status(400).json(Response.userFailResp("NVR Authentication failed", authErr.message));
    }

    // Step 2: Fetch device info
    let deviceName = nvrName, model = "", serialNumber = "", firmwareVersion = "", macAddress = "";
    const devRes = await tiandyGet(ip, port, "/ISAPI/System/deviceInfo", sessionToken);
    if (devRes.ok) {
      const devXml = await devRes.text();
      const x = (tag) => (devXml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";
      deviceName    = x("deviceName") || nvrName;
      model         = x("model");
      serialNumber  = x("serialNumber");
      macAddress    = x("macAddress");
      firmwareVersion = x("firmwareVersion");
    }

    // Step 3: Fetch camera channels
    const chRes = await tiandyGet(ip, port, "/ISAPI/ContentMgmt/InputProxy/channels", sessionToken);
    await tiandyGet(ip, port, "/ISAPI/ContentMgmt/InputProxy/channels/status", sessionToken);

    let channels = [];
    if (chRes.ok) {
      const chXml = await chRes.text();
      const chMatches = [...chXml.matchAll(/<InputProxyChannel>([\s\S]*?)<\/InputProxyChannel>/g)];
      channels = chMatches.map((m) => {
        const cx = (tag) => (m[1].match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";
        return { id: cx("id"), name: cx("name"), ipAddress: cx("ipAddress") };
      });
    }

    // Step 4: Save NVR
    const savedNVR = await NVR.create({
      userId: user_id,
      ip,
      username,
      password,
      port,
      rtspPort,
      nvrName,
      brand: "tiandy",
      deviceName,
      model,
      serialNumber,
      macAddress,
      firmwareVersion,
      deviceType: "NVR",
      location,
    });

    // Step 5: Save cameras (fallback to 16 if channel list empty)
    const totalChannels = channels.length > 0 ? channels.length : 16;
    const cameraResults = [];

    for (let i = 0; i < totalChannels; i++) {
      const ch = channels[i];
      const chNum = ch ? ch.id : String(i + 1);
      const savedCam = await Camera.create({
        nvrId: savedNVR._id,
        userId: user_id,
        channelId: chNum,
        rtspChannels: [
          { id: `${chNum}_1`, resolution: { width: 0, height: 0 } },
          { id: `${chNum}_2`, resolution: { width: 0, height: 0 } },
        ],
        name: ch?.name || `Camera ${chNum}`,
        ipAddress: ch?.ipAddress || "",
        model: "",
        serialNumber: "",
        firmwareVersion: "",
        streamEndpoint: "",
      });

      const uid = `${savedNVR._id}-${savedCam._id}`;
      const rtspUrl = buildRTSPUrl(savedNVR, savedCam, "main");
      registerCameraStream(uid, rtspUrl);
      cameraResults.push(savedCam);
    }

    await NVR.findByIdAndUpdate(savedNVR._id, { cameraCount: cameraResults.length });

    autoSyncLocations(
      { _id: req?.verified?.userData?.adminId },
      { user_id }
    ).catch((e) => logger.error("Post-NVR registration sync failed", e));

    return res.status(201).json(
      Response.userSuccessResp("Tiandy NVR and channels registered successfully", {
        nvr: { ...savedNVR?._doc, cameraCount: cameraResults.length },
        channels: cameraResults,
      })
    );
  } catch (error) {
    logger.error("Tiandy Register NVR Error:", error);
    const isDuplicateError = error?.message?.includes("E11000");
    const errMsg = isDuplicateError ? "NVR already exists" : error.message || "Unknown error";
    return res.status(500).json(Response.errorResp("NVR registration failed", errMsg));
  }
}



async function handleDahuaRegistration(req, res) {
  return res
    .status(500)
    .json(
      Response.errorResp("NVR registration failed", "Dahua is not available")
    );
}
async function handlePramaRegistration(req, res) {
  return res
    .status(500)
    .json(
      Response.errorResp("NVR registration failed", "Prama is not available")
    );
}

async function updateHikvisionChannels(nvr, plainPassword, res) {
  const { ip: encryptedIp, port, username, _id: nvrId, userId } = nvr;
  const ip = decrypt(encryptedIp);

  try {
    const client = new DigestFetch(username, plainPassword);

    // 1. Get Camera Channel Info
    const channelsRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels`
    );
    if (!channelsRes.ok) {
      logger.error(
        "Hikvision NVR Authentication failed during update",
        JSON.stringify(channelsRes)
      );
      return res
        .status(400)
        .json(
          Response.userFailResp(
            "NVR Authentication failed",
            "NVR Authentication failed"
          )
        );
    }

    const channelsXml = await channelsRes.text();
    const channelsData = await parseXml(channelsXml);
    const channelList = channelsData?.InputProxyChannelList?.InputProxyChannel;
    const channels = Array.isArray(channelList) ? channelList : [channelList];

    // 2. Get Streaming Status Info
    const statusRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels/status`
    );
    const statusXml = await statusRes.text();
    const statusData = await parseXml(statusXml);
    const statusList =
      statusData?.InputProxyChannelStatusList?.InputProxyChannelStatus;
    const statuses = Array.isArray(statusList) ? statusList : [statusList];

    // 3. Get Stream Resolution Info
    const streamInfoRes = await client.fetch(
      `http://${ip}:${port}/ISAPI/Streaming/channels/`
    );
    const streamInfoXml = await streamInfoRes.text();
    const streamInfoData = await parseXml(streamInfoXml);
    const streamingChannelList =
      streamInfoData?.StreamingChannelList?.StreamingChannel;
    const streamingChannels = Array.isArray(streamingChannelList)
      ? streamingChannelList
      : [streamingChannelList];

    const streamResolutionMap = {};
    for (const stream of streamingChannels) {
      const id = stream?.id;
      const width = stream?.Video?.videoResolutionWidth;
      const height = stream?.Video?.videoResolutionHeight;
      if (id && width && height) {
        streamResolutionMap[id] = {
          width: parseInt(width, 10),
          height: parseInt(height, 10),
        };
      }
    }

    const cameraResults = [];

    for (const ch of channels) {
      const chId = ch.id;
      const status = statuses.find((s) => s.id === chId);
      const streamIds =
        status?.streamingProxyChannelIdList?.streamingProxyChannelId || [];

      if (streamIds.length === 0) continue;

      const rtspChannels = streamIds.map((id) => {
        return {
          id,
          resolution: streamResolutionMap[id] || { width: 0, height: 0 },
        };
      });

      let existingCam = await Camera.findOne({ nvrId, channelId: chId });

      if (existingCam) {
        existingCam.name = ch?.name || existingCam.name;
        existingCam.ipAddress =
          ch?.sourceInputPortDescriptor?.ipAddress || existingCam.ipAddress;
        existingCam.rtspChannels = rtspChannels;
        await existingCam.save();
        cameraResults.push(existingCam);
      } else {
        const savedCam = await Camera.create({
          nvrId,
          userId,
          channelId: chId,
          rtspChannels,
          name: ch?.name || "",
          ipAddress: ch?.sourceInputPortDescriptor?.ipAddress || "",
          model: ch?.sourceInputPortDescriptor?.model || "",
          serialNumber: ch?.sourceInputPortDescriptor?.serialNumber || "",
          firmwareVersion: ch?.sourceInputPortDescriptor?.firmwareVersion || "",
          streamEndpoint: "/Streaming/Channels/",
        });

        const uid = `${nvrId}-${savedCam._id}`;
        const rtspUrl = buildRTSPUrl(nvr, savedCam, "main");
        registerCameraStream(uid, rtspUrl);
        cameraResults.push(savedCam);
      }
    }

    const totalCameras = await Camera.countDocuments({ nvrId });

    await NVR.findByIdAndUpdate(nvrId, { cameraCount: totalCameras });

    return res
      .status(200)
      .json(
        Response.userSuccessResp(
          "Hikvision NVR channels updated successfully",
          {}
        )
      );
  } catch (error) {
    logger.error("Hikvision Update Channels Error:", error);
    return res
      .status(500)
      .json(Response.errorResp("Channel update failed", error.message));
  }
}

async function updateCPPlusChannels(nvr, plainPassword, res) {
  const { ip: encryptedIp, port, username, _id: nvrId, userId } = nvr;
  const ip = decrypt(encryptedIp);

  try {
    const client = new DigestFetch(username, plainPassword);

    const channelTitlesRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`
    );
    if (!channelTitlesRes.ok) {
      return res
        .status(400)
        .json(
          Response.userFailResp(
            "NVR Authentication failed",
            "NVR Authentication failed"
          )
        );
    }
    const channelTitlesText = await channelTitlesRes.text();
    const channelTitlesData = parseCPPlusResponse(channelTitlesText);

    const channelNames = {};
    Object.keys(channelTitlesData).forEach((key) => {
      const match = key.match(/table\.ChannelTitle\[(\d+)\]\.Name/);
      if (match) {
        const channelIdx = match[1];
        channelNames[channelIdx] = channelTitlesData[key];
      }
    });

    const channelsRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=VideoInOptions`
    );
    const channelsText = await channelsRes.text();
    const channelsData = parseCPPlusResponse(channelsText);
    const channelGroups = groupArrayProperties(
      channelsData,
      "table.VideoInOptions["
    );

    const encodeRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=Encode`
    );
    const encodeText = await encodeRes.text();
    const encodeData = parseCPPlusResponse(encodeText);

    const encodeGroups = {};
    Object.keys(encodeData).forEach((key) => {
      const match = key.match(
        /table\.Encode\[(\d+)\]\.(MainFormat|ExtraFormat)\[(\d+)\]\.Video\.(Width|Height|Compression|BitRate|FPS)/
      );

      if (match) {
        const channelIdx = match[1];
        const streamType = match[2];
        const streamIdx = match[3];
        const property = match[4];

        const streamKey = `${channelIdx}_${streamType}_${streamIdx}`;

        if (!encodeGroups[streamKey]) {
          encodeGroups[streamKey] = {
            channel: channelIdx,
            streamType,
            streamIdx,
            id: `${parseInt(channelIdx) + 1}${
              streamType === "MainFormat" ? "01" : "02"
            }`,
          };
        }

        if (property === "Width") {
          encodeGroups[streamKey].width = parseInt(encodeData[key], 10);
        } else if (property === "Height") {
          encodeGroups[streamKey].height = parseInt(encodeData[key], 10);
        } else {
          encodeGroups[streamKey][property.toLowerCase()] = encodeData[key];
        }
      }
    });

    const remoteRes = await client.fetch(
      `http://${ip}:${port}/cgi-bin/configManager.cgi?action=getConfig&name=RemoteDevice`
    );

    const remoteText = await remoteRes.text();

    const remoteData = parseCPPlusResponse(remoteText);

    const remoteGroups = groupRemoteDeviceProperties(remoteData);

    const cameraResults = [];

    for (const chGroup of channelGroups) {
      const chId = chGroup.channel;

      const channelStreams = Object.values(encodeGroups).filter(
        (stream) => stream.channel === chId && stream.width && stream.height
      );

      if (channelStreams.length === 0) continue;

      const rtspChannels = channelStreams.map((stream) => ({
        id: stream.id,
        resolution: {
          width: stream.width || 0,
          height: stream.height || 0,
        },
      }));

      const cameraName =
        channelNames[chId] ||
        chGroup.Alias ||
        chGroup.Name ||
        `Camera ${parseInt(chId) + 1}`;

      const remoteDevice = remoteGroups.find(
        (rd) => rd.Channel === chId || rd.channel === chId
      );

      let existingCam = await Camera.findOne({
        nvrId,
        channelId: (parseInt(chId) + 1).toString(),
      });

      if (existingCam) {
        existingCam.name = cameraName;
        existingCam.ipAddress =
          chGroup?.IPAddress || remoteDevice?.Address || existingCam.ipAddress;
        existingCam.rtspChannels = rtspChannels;
        await existingCam.save();
        cameraResults.push(existingCam);
      } else {
        const savedCam = await Camera.create({
          nvrId,
          userId,
          channelId: (parseInt(chId) + 1).toString(),
          rtspChannels,
          name: cameraName,
          ipAddress: chGroup?.IPAddress || remoteDevice?.Address || "",
          model: chGroup?.Model || remoteDevice?.Model || "",
          serialNumber: chGroup?.SerialNumber || remoteDevice?.SerialNo || "",
          firmwareVersion:
            chGroup?.FirmwareVersion || remoteDevice?.FirmwareVersion || "",
          streamEndpoint: "/cam/realmonitor",
        });

        const uid = `${nvrId}-${savedCam._id}`;
        const rtspUrl = buildRTSPUrl(nvr, savedCam, "main");
        await registerCameraStream(uid, rtspUrl);
        cameraResults.push(savedCam);
      }
    }

    const totalCameras = await Camera.countDocuments({ nvrId });

    await NVR.findByIdAndUpdate(nvrId, { cameraCount: totalCameras });

    return res
      .status(200)
      .json(
        Response.userSuccessResp(
          "CP Plus NVR channels updated successfully",
          {}
        )
      );
  } catch (error) {
    logger.error("CP Plus Update Channels Error:", error);
    return res
      .status(500)
      .json(Response.errorResp("Channel update failed", error.message));
  }
}


async function updateTiandyChannels(nvr, plainPassword, res) {
  const { _id: nvrId, userId, port } = nvr;
  const ip = decrypt(nvr.ip);

  try {
    // Re-authenticate with correct Tiandy session flow
    let sessionToken;
    try {
      sessionToken = await tiandyLogin(ip, port, nvr.username, plainPassword);
    } catch (authErr) {
      return res.status(400).json(Response.userFailResp("NVR Authentication failed", authErr.message));
    }

    const authHeaders = { HttpSession: sessionToken, "If-Modified-Since": "0" };

    // Fetch live channel list from device
    let channels = [];
    const chRes = await fetch(`http://${ip}:${port}/ISAPI/ContentMgmt/InputProxy/channels`, { headers: authHeaders });
    if (chRes.ok) {
      const chXml = await chRes.text();
      const chMatches = [...chXml.matchAll(/<InputProxyChannel>([\s\S]*?)<\/InputProxyChannel>/g)];
      channels = chMatches.map((m) => {
        const cx = (tag) => (m[1].match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1] || "";
        return { id: cx("id"), name: cx("name"), ipAddress: cx("ipAddress") };
      });
    }

    const totalChannels = channels.length > 0 ? channels.length : 16;
    const cameraResults = [];

    for (let i = 0; i < totalChannels; i++) {
      const ch = channels[i];
      const chNum = ch ? ch.id : String(i + 1);

      let existingCam = await Camera.findOne({ nvrId, channelId: chNum });

      if (existingCam) {
        if (ch?.name) existingCam.name = ch.name;
        if (ch?.ipAddress) existingCam.ipAddress = ch.ipAddress;
        await existingCam.save();
        cameraResults.push(existingCam);
      } else {
        const savedCam = await Camera.create({
          nvrId,
          userId,
          channelId: chNum,
          rtspChannels: [
            { id: `${chNum}_1`, resolution: { width: 0, height: 0 } },
            { id: `${chNum}_2`, resolution: { width: 0, height: 0 } },
          ],
          name: ch?.name || `Camera ${chNum}`,
          ipAddress: ch?.ipAddress || "",
          model: "",
          serialNumber: "",
          firmwareVersion: "",
          streamEndpoint: "",
        });

        const uid = `${nvrId}-${savedCam._id}`;
        const rtspUrl = buildRTSPUrl(nvr, savedCam, "main");
        await registerCameraStream(uid, rtspUrl);
        cameraResults.push(savedCam);
      }
    }

    const totalCameras = await Camera.countDocuments({ nvrId });
    await NVR.findByIdAndUpdate(nvrId, { cameraCount: totalCameras });

    return res.status(200).json(Response.userSuccessResp("Tiandy NVR channels updated successfully", {}));
  } catch (error) {
    logger.error("Tiandy Update Channels Error:", error);
    return res.status(500).json(Response.errorResp("Channel update failed", error.message));
  }
}

// ─── Securus (XiongMai Sofia DVR/NVR) ────────────────────────────────────────
// Protocol: DVRIP binary TCP on port 34567
// Packet: 20-byte header + JSON body
// Auth: Sofia password hash = first 8 chars of even-indexed MD5 hex, uppercased

import net from "net";

function sofiaPwdHash(password, createHash) {
  const md5 = createHash("md5").update(password).digest("hex");
  let hash = "";
  for (let i = 0; i < 16; i++) hash += md5[i * 2];
  return hash.toUpperCase();
}

function dvripPacket(sessionId, sequence, msgId, jsonBody) {
  const body = Buffer.from(jsonBody + "\n\0", "utf8");
  const header = Buffer.alloc(20);
  header[0] = 0xff;
  header.writeUInt32LE(sessionId, 4);
  header.writeUInt32LE(sequence, 8);
  header.writeUInt16LE(msgId, 14);
  header.writeUInt32LE(body.length, 16);
  return Buffer.concat([header, body]);
}

function dvripSend(socket, sessionId, seq, msgId, payload) {
  socket.write(dvripPacket(sessionId, seq, msgId, JSON.stringify(payload)));
}

function dvripConnect(ip, dvripPort, username, password, createHash) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: ip, port: dvripPort, timeout: 8000 });
    let buf = Buffer.alloc(0);
    let sessionId = 0;
    let seq = 0;
    let loggedIn = false;

    const results = {};
    const pending = {};
    let pendingCount = 0;

    sock.on("connect", () => {
      const hash = sofiaPwdHash(password, createHash);
      dvripSend(sock, 0, seq++, 1000, {
        EncryptType: "MD5",
        LoginType: "DVRIP",
        PassWord: hash,
        UserName: username,
      });
    });

    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 20) {
        const dataLen = buf.readUInt32LE(16);
        if (buf.length < 20 + dataLen) break;
        const msgId = buf.readUInt16LE(14);
        sessionId = buf.readUInt32LE(4);
        const jsonStr = buf.slice(20, 20 + dataLen).toString("utf8").replace(/\0/g, "").trim();
        buf = buf.slice(20 + dataLen);

        let parsed = {};
        try { parsed = JSON.parse(jsonStr); } catch (_) { /* ignore */ }

        if (msgId === 1001) {
          // Login response
          if (parsed.Ret !== 100) {
            sock.destroy();
            return reject(new Error(`DVRIP login failed (Ret=${parsed.Ret})`));
          }
          loggedIn = true;
          const sidHex = "0x" + sessionId.toString(16).padStart(8, "0").toUpperCase();

          // Request SystemInfo
          dvripSend(sock, sessionId, seq++, 1020, { Name: "SystemInfo", SessionID: sidHex });
          // Request ChannelTitle
          dvripSend(sock, sessionId, seq++, 1042, { Name: "ChannelTitle", SessionID: sidHex });
          // Request Encode (channel count)
          dvripSend(sock, sessionId, seq++, 1042, { Name: "Encode", SessionID: sidHex });
          pendingCount = 3;
        } else if (msgId === 1021) {
          results.systemInfo = parsed.Name === "SystemInfo" ? parsed : {};
          if (--pendingCount === 0) { sock.destroy(); resolve(results); }
        } else if (msgId === 1043) {
          if (parsed.Name === "ChannelTitle") results.channelTitle = parsed;
          else if (parsed.Name === "Encode") results.encode = parsed;
          if (--pendingCount === 0) { sock.destroy(); resolve(results); }
        }
      }
    });

    sock.on("timeout", () => { sock.destroy(); reject(new Error("DVRIP connection timeout")); });
    sock.on("error", (err) => reject(err));
  });
}

async function handleSecurusRegistration(req, res) {
  try {
    const { createHash } = await import("crypto");
    const user_id = req?.verified?.userData?.user_id;
    const { ip, port, username, password, rtspPort, nvrName, location } = req.body;

    // DVRIP always uses port 34567 regardless of HTTP port
    const dvripPort = 34567;
    const dvripData = await dvripConnect(ip, dvripPort, username, password, createHash);

    // Parse device info
    const si = dvripData.systemInfo || {};
    const deviceInfo = {
      deviceName: si.DeviceName || nvrName || "",
      model: si.HardWare || si.BoardSerialNo || "",
      serialNumber: si.SerialNo || "",
      firmwareVersion: si.SoftWareVersion || "",
      macAddress: "",
      deviceType: "NVR",
    };

    // Parse channel titles
    const titleTable = dvripData.channelTitle?.ChannelTitle || [];
    const channelTitles = titleTable.map((t) => t.Name || "");

    // Parse channel count from Encode config
    let channelCount = channelTitles.length || 4;
    const encodeTable = dvripData.encode?.Encode || [];
    if (encodeTable.length > 0) channelCount = encodeTable.length;

    // Save NVR
    const savedNVR = await NVR.create({
      userId: user_id,
      ip, username, password, port, rtspPort, nvrName, location: location || "",
      brand: "securus",
      deviceName: deviceInfo.deviceName,
      model: deviceInfo.model,
      serialNumber: deviceInfo.serialNumber,
      firmwareVersion: deviceInfo.firmwareVersion,
      macAddress: deviceInfo.macAddress,
      deviceType: deviceInfo.deviceType,
      cameraCount: 0,
    });

    // Save channels
    const cameraResults = [];
    for (let i = 0; i < channelCount; i++) {
      const chNum = String(i + 1);
      const savedCam = await Camera.create({
        nvrId: savedNVR._id,
        userId: user_id,
        channelId: chNum,
        name: channelTitles[i] || `Camera ${chNum}`,
        ipAddress: "",
        model: "",
        serialNumber: "",
        firmwareVersion: "",
        streamEndpoint: "",
        rtspChannels: [
          { id: `${chNum}_0`, resolution: { width: 0, height: 0 } },
          { id: `${chNum}_1`, resolution: { width: 0, height: 0 } },
        ],
      });

      const uid = `${savedNVR._id}-${savedCam._id}`;
      const rtspUrl = buildRTSPUrl(savedNVR, savedCam, "main");
      registerCameraStream(uid, rtspUrl);
      cameraResults.push(savedCam);
    }

    await NVR.findByIdAndUpdate(savedNVR._id, { cameraCount: cameraResults.length });

    autoSyncLocations(
      { _id: req?.verified?.userData?.adminId },
      { user_id }
    ).catch((e) => logger.error("Post-NVR registration sync failed", e));

    return res.status(201).json(
      Response.userSuccessResp("Securus NVR and channels registered successfully", {
        nvr: { ...savedNVR._doc, cameraCount: cameraResults.length },
        channels: cameraResults,
      })
    );
  } catch (error) {
    logger.error("Securus Register NVR Error:", error);
    const isDuplicate = error?.message?.includes("E11000");
    const errMsg = isDuplicate ? "NVR already exists" : error.message || "Unknown error";
    return res.status(500).json(Response.errorResp("NVR registration failed", errMsg));
  }
}

async function updateSecurusChannels(_nvr, _plainPassword, res) {
  return res.status(500).json(Response.errorResp("Channel update failed", "Securus channel update not yet implemented"));
}

async function updateDahuaChannels(_nvr, _plainPassword, res) {
  return res
    .status(500)
    .json(
      Response.errorResp("Channel update failed", "Dahua is not available")
    );
}

async function updatePramaChannels(_nvr, _plainPassword, res) {
  return res
    .status(500)
    .json(
      Response.errorResp("Channel update failed", "Prama is not available")
    );
}

export const registrationHandlers = {
  hikvision: handleHikvisionRegistration,
  cpplus: handleCPPlusRegistration,
  tiandy: handleTiandyRegistration,
  dahua: handleDahuaRegistration,
  prama: handlePramaRegistration,
  securus: handleSecurusRegistration,
  camera: handleSingleCameraRegistration,
};

export const updateHandlers = {
  hikvision: updateHikvisionChannels,
  cpplus: updateCPPlusChannels,
  tiandy: updateTiandyChannels,
  dahua: updateDahuaChannels,
  prama: updatePramaChannels,
  securus: updateSecurusChannels,
};

export default registrationHandlers;
