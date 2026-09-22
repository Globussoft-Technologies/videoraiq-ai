import DigestFetch from "digest-fetch";

const API_VERSION = "1.0";

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const unwrapData = (payload) => payload?.data ?? payload ?? {};

const firstValue = (source, keys, fallback = "") => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
};

const channelNumber = (item, index) => {
  const raw = firstValue(item, ["channel_id", "channelId", "id", "channel", "index"], index + 1);
  const match = String(raw).match(/\d+/);
  return match ? String(Number(match[0])) : String(index + 1);
};

/** Normalize TVT's Login/ChannelInfo response into the application's camera shape. */
export const normalizeHoneywellChannels = (payload, deviceInfo = {}) => {
  const data = unwrapData(payload);
  const items =
    data?.channel_param?.items ??
    data?.channelParam?.items ??
    data?.channels ??
    data?.items ??
    [];
  const normalizedItems = Array.isArray(items) ? items : [];
  const declaredCount = Number(
    firstValue(unwrapData(deviceInfo), ["channel_num", "channelNum", "camera_num", "cameraCount"], 0),
  );
  const source = normalizedItems.length
    ? normalizedItems
    : Array.from({ length: Number.isFinite(declaredCount) ? declaredCount : 0 }, () => ({}));

  return source.map((item, index) => {
    const id = channelNumber(item, index);
    return {
      channelId: id,
      name: firstValue(item, ["channel_name", "channelName", "name", "channel_alias"], `Camera ${id}`),
      ipAddress: firstValue(item, ["ip_address", "ipAddress", "ip", "address"]),
      model: firstValue(item, ["model", "device_model", "deviceModel"]),
      serialNumber: firstValue(item, ["serial_number", "serialNumber", "serial_no"]),
      firmwareVersion: firstValue(item, ["firmware_version", "firmwareVersion", "software_version"]),
      streamEndpoint: "/chID=",
      rtspChannels: [
        { id: `${id}_main`, resolution: { width: 0, height: 0 } },
        { id: `${id}_sub`, resolution: { width: 0, height: 0 } },
      ],
    };
  });
};

export const normalizeHoneywellDeviceInfo = (payload) => {
  const data = unwrapData(payload);
  return {
    deviceName: firstValue(data, ["device_name", "deviceName", "name"], "Honeywell NVR"),
    model: firstValue(data, ["model", "device_model", "deviceModel", "product_model"]),
    serialNumber: firstValue(data, ["serial_number", "serialNumber", "serial_no", "sn"]),
    macAddress: firstValue(data, ["mac_address", "macAddress", "mac"]),
    firmwareVersion: firstValue(data, ["firmware_version", "firmwareVersion", "software_version", "version"]),
    deviceType: firstValue(data, ["device_type", "deviceType", "device_type_cloud"], "NVR"),
  };
};

const apiPost = async (client, baseUrl, path, token, body = {}) => {
  const response = await client.fetch(`${baseUrl}/API/${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json; charset=utf-8",
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { "X-csrftoken": token } : {}),
    },
    body: JSON.stringify({ version: API_VERSION, data: body }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await safeJson(response);
  return { response, payload };
};

/**
 * Honeywell I-HPNVR recorders use TVT's HTTP API: Digest login followed by
 * X-csrftoken-authenticated device and channel calls.
 */
export async function fetchHoneywellTvtCameras({
  ip,
  port,
  username,
  password,
  client = new DigestFetch(username, password),
}) {
  const baseUrl = `http://${ip}:${port}`;
  const loginResponse = await client.fetch(`${baseUrl}/API/Web/Login`, {
    method: "POST",
    headers: {
      Accept: "application/json; charset=utf-8",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(10000),
  });
  const loginPayload = await safeJson(loginResponse);

  if (!loginResponse.ok || loginPayload?.result === "failed") {
    const code = loginPayload?.error_code || loginPayload?.reason;
    if (code === "no_permission" || loginPayload?.reason === "No remote login permission!") {
      throw new Error("Honeywell user does not have Remote/Web login permission");
    }
    throw new Error(code ? `Honeywell authentication failed: ${code}` : "Honeywell authentication failed");
  }

  const token =
    loginPayload?.token ||
    loginPayload?.data?.token ||
    loginResponse.headers?.get?.("x-csrftoken");
  if (!token) throw new Error("Honeywell login succeeded but no session token was returned");

  const [deviceResult, channelResult] = await Promise.all([
    apiPost(client, baseUrl, "Login/DeviceInfo/Get", token, { support_new_schedule: true }),
    apiPost(client, baseUrl, "Login/ChannelInfo/Get", token),
  ]);

  for (const { response, payload } of [deviceResult, channelResult]) {
    if (!response.ok || payload?.result === "failed") {
      const code = payload?.error_code || payload?.reason || response.status;
      throw new Error(`Honeywell discovery failed: ${code}`);
    }
  }

  const deviceInfo = normalizeHoneywellDeviceInfo(deviceResult.payload);
  const cameras = normalizeHoneywellChannels(channelResult.payload, deviceResult.payload);
  if (!cameras.length) throw new Error("Honeywell NVR returned no camera channels");

  return { deviceInfo, cameras };
}
