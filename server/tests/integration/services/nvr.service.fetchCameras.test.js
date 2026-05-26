/**
 * Coverage for NVRService._fetchCamerasFromNvr — the private camera-discovery
 * helper that walks the Hikvision and CP Plus device APIs over digest-auth
 * HTTP and returns a normalized `{ deviceInfo, cameras }` payload.
 *
 * R82 — server phase. After R81 took nvr.service.js to 48.69% with the
 * addNvr / removeCamera / registerNvr happy paths, the next biggest reachable
 * region is this private method (lines ~988-1261, ~270 LOC) which is the
 * worker that powers `registerAndFetchCameras` and `editNvrCameras`. The
 * public methods above it are cloud-schema-only (they `.create()` NVR docs
 * with `ip`/`port`/`username`/`password` fields that don't exist on the
 * `local` schema used by `tests/setup.js`), but the helper itself is pure
 * code over digest-fetch responses + parseXml — perfectly testable.
 *
 * Branches exercised:
 *   • hikvision happy path — deviceInfo + 1 channel + 2 RTSP streams
 *     (main+sub) with resolutions parsed correctly + status lookup join
 *   • hikvision auth fail — first deviceInfo fetch returns ok=false →
 *     early-return { error: "Failed to authenticate with Hikvision NVR" }
 *   • cpplus happy path — deviceInfo + ChannelTitle + VideoInOptions +
 *     Encode walked through the plain-text parser + groupArrayProperties
 *     + width/height extracted from MainFormat[0] regex
 *   • cpplus auth fail — first deviceInfo fetch returns ok=false →
 *     early-return { error: "Failed to authenticate with CP Plus NVR" }
 *   • unsupported brand — returns { error: "...not yet supported..." }
 *   • outer catch arm — fetch throws → returns { error: error.message }
 *
 * Mocks (1 — well below the 8 cap):
 *   1. digest-fetch — default-export class with a configurable .fetch()
 *      that returns objects mimicking the real fetch Response interface
 *      (`{ ok, text() }`). Each test queues responses in order so the
 *      service's sequential client.fetch(...) calls all land deterministically.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

// Queue of responses each test pushes to, in fetch-call order.
const fetchQueue = [];
const fetchSpy = vi.fn(async () => {
  if (fetchQueue.length === 0) {
    throw new Error("digest-fetch mock: queue exhausted");
  }
  const next = fetchQueue.shift();
  if (typeof next === "function") return next();
  return next;
});

// digest-fetch exports a default class. The service does `new DigestFetch(u,p)`
// then calls `.fetch(url)` on the instance. The constructor doesn't need to
// do anything — the spy is shared across all instances.
class DigestFetchStub {
  constructor(_user, _pass) {}
  fetch(url) {
    return fetchSpy(url);
  }
}

vi.doMock("digest-fetch", () => ({ default: DigestFetchStub }));

// Import after mock is setup using dynamic import
const { default: NVRService } = await import(
  "../../../core/v1/NVR/nvr.service.js"
);

beforeAll(async () => {
  // Connect mongo because the service module imports mongoose models at the
  // top — model registration during the import would otherwise fall through
  // to the real mongoose connection lifecycle and trip the worker pool.
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  fetchQueue.length = 0;
  fetchSpy.mockClear();
});

/** Helper to build an OK response with a text body. */
function okText(text) {
  return { ok: true, text: async () => text };
}
/** Helper to build a NOT-OK response (no body needed for the early-return). */
function failText() {
  return { ok: false, text: async () => "" };
}

// ---------------------------------------------------------------------------
// Hikvision branch
// ---------------------------------------------------------------------------
describe("NVRService._fetchCamerasFromNvr — hikvision", () => {
  it("returns deviceInfo + a normalized camera list on the happy path", async () => {
    // 1: deviceInfo
    fetchQueue.push(
      okText(`<?xml version="1.0"?>
<DeviceInfo>
  <deviceName>NVR-LOBBY</deviceName>
  <model>DS-7608NI</model>
  <serialNumber>SN-001</serialNumber>
  <macAddress>aa:bb:cc:dd:ee:ff</macAddress>
  <firmwareVersion>v4.50</firmwareVersion>
  <deviceType>NVR</deviceType>
</DeviceInfo>`),
    );
    // 2: channels (InputProxyChannelList with 1 channel)
    fetchQueue.push(
      okText(`<?xml version="1.0"?>
<InputProxyChannelList>
  <InputProxyChannel>
    <id>1</id>
    <name>Front-Door</name>
    <sourceInputPortDescriptor>
      <ipAddress>10.0.0.42</ipAddress>
      <model>CamModel-X</model>
      <serialNumber>CAM-SN-1</serialNumber>
      <firmwareVersion>cam-v1.0</firmwareVersion>
    </sourceInputPortDescriptor>
  </InputProxyChannel>
</InputProxyChannelList>`),
    );
    // 3: channel status (link channel "1" to stream ids 101/102)
    fetchQueue.push(
      okText(`<?xml version="1.0"?>
<InputProxyChannelStatusList>
  <InputProxyChannelStatus>
    <id>1</id>
    <streamingProxyChannelIdList>
      <streamingProxyChannelId>101</streamingProxyChannelId>
      <streamingProxyChannelId>102</streamingProxyChannelId>
    </streamingProxyChannelIdList>
  </InputProxyChannelStatus>
</InputProxyChannelStatusList>`),
    );
    // 4: streaming channels — declare resolutions for both 101 and 102
    fetchQueue.push(
      okText(`<?xml version="1.0"?>
<StreamingChannelList>
  <StreamingChannel>
    <id>101</id>
    <Video>
      <videoResolutionWidth>1920</videoResolutionWidth>
      <videoResolutionHeight>1080</videoResolutionHeight>
    </Video>
  </StreamingChannel>
  <StreamingChannel>
    <id>102</id>
    <Video>
      <videoResolutionWidth>640</videoResolutionWidth>
      <videoResolutionHeight>480</videoResolutionHeight>
    </Video>
  </StreamingChannel>
</StreamingChannelList>`),
    );

    const out = await NVRService._fetchCamerasFromNvr(
      "Hikvision", // mixed case → exercise `.toLowerCase()` branch
      "10.0.0.10",
      80,
      "admin",
      "secret",
    );

    expect(out.error).toBeUndefined();
    expect(out.deviceInfo).toMatchObject({
      deviceName: "NVR-LOBBY",
      model: "DS-7608NI",
      serialNumber: "SN-001",
    });
    expect(out.cameras).toHaveLength(1);
    const cam = out.cameras[0];
    expect(cam.channelId).toBe("1");
    expect(cam.name).toBe("Front-Door");
    expect(cam.ipAddress).toBe("10.0.0.42");
    expect(cam.streamEndpoint).toBe("/Streaming/Channels/");
    // Resolution join worked for both streams.
    expect(cam.rtspChannels).toEqual([
      { id: "101", resolution: { width: 1920, height: 1080 } },
      { id: "102", resolution: { width: 640, height: 480 } },
    ]);

    // 4 fetches total, in the documented endpoint order.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("returns { error } when the deviceInfo fetch fails (ok=false)", async () => {
    fetchQueue.push(failText());

    const out = await NVRService._fetchCamerasFromNvr(
      "hikvision",
      "10.0.0.10",
      80,
      "admin",
      "wrong-pass",
    );
    expect(out).toEqual({
      error: "Failed to authenticate with Hikvision NVR",
    });
    // Should NOT proceed to the channels fetch.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// CP Plus branch
// ---------------------------------------------------------------------------
describe("NVRService._fetchCamerasFromNvr — cpplus", () => {
  it("returns deviceInfo + a normalized camera list on the happy path", async () => {
    // 1: deviceInfo (key=value plain text)
    fetchQueue.push(
      okText(
        [
          "deviceName=CPPLUS-NVR-1",
          "deviceModel=CP-UNR-4K1-4",
          "serialNumber=CPP-SN-001",
          "macAddress=11:22:33:44:55:66",
          "softwareVersion=v3.218",
          "deviceClass=NVR",
        ].join("\n"),
      ),
    );
    // 2: channel titles (just 1 channel)
    fetchQueue.push(
      okText("table.ChannelTitle[0].Name=Gate-Cam"),
    );
    // 3: VideoInOptions for channel 0
    fetchQueue.push(
      okText(
        [
          "table.VideoInOptions[0].Name=Front",
          "table.VideoInOptions[0].IPAddress=10.0.0.50",
          "table.VideoInOptions[0].Model=ModelA",
          "table.VideoInOptions[0].SerialNumber=CAMSN1",
          "table.VideoInOptions[0].FirmwareVersion=cam-fw-1.0",
        ].join("\n"),
      ),
    );
    // 4: Encode — MainFormat[0] and ExtraFormat[0] for channel 0, both with W/H.
    fetchQueue.push(
      okText(
        [
          "table.Encode[0].MainFormat[0].Video.Width=1920",
          "table.Encode[0].MainFormat[0].Video.Height=1080",
          "table.Encode[0].ExtraFormat[0].Video.Width=704",
          "table.Encode[0].ExtraFormat[0].Video.Height=480",
        ].join("\n"),
      ),
    );

    const out = await NVRService._fetchCamerasFromNvr(
      "CPPLUS", // mixed case again
      "10.0.0.20",
      80,
      "admin",
      "secret",
    );

    expect(out.error).toBeUndefined();
    expect(out.deviceInfo).toMatchObject({
      deviceName: "CPPLUS-NVR-1",
      model: "CP-UNR-4K1-4",
      serialNumber: "CPP-SN-001",
      firmwareVersion: "v3.218",
      deviceType: "NVR",
    });
    expect(out.cameras).toHaveLength(1);
    const cam = out.cameras[0];
    // CP Plus IDs are 1-indexed in the output (chId+1).
    expect(cam.channelId).toBe("1");
    expect(cam.name).toBe("Gate-Cam");
    expect(cam.streamEndpoint).toBe("/cam/realmonitor");
    expect(cam.rtspChannels).toHaveLength(2);
    // First should be MainFormat[0] → id "101", resolution 1920x1080.
    expect(cam.rtspChannels[0]).toMatchObject({
      id: "101",
      resolution: { width: 1920, height: 1080 },
    });
    expect(cam.rtspChannels[1]).toMatchObject({
      id: "102",
      resolution: { width: 704, height: 480 },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("returns { error } when the CP Plus deviceInfo fetch fails (ok=false)", async () => {
    fetchQueue.push(failText());
    const out = await NVRService._fetchCamerasFromNvr(
      "cpplus",
      "10.0.0.20",
      80,
      "admin",
      "bad",
    );
    expect(out).toEqual({
      error: "Failed to authenticate with CP Plus NVR",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Unsupported brand + outer catch
// ---------------------------------------------------------------------------
describe("NVRService._fetchCamerasFromNvr — unsupported + error arms", () => {
  it("returns the 'not yet supported' message for an unrecognized brand", async () => {
    const out = await NVRService._fetchCamerasFromNvr(
      "axis",
      "10.0.0.99",
      "u",
      "p",
    );
    expect(out).toEqual({
      error: "This brand is not yet supported for camera discovery",
    });
    // Never reaches a fetch — the brand check happens before any fetch call.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("catches fetch exceptions and returns { error: error.message }", async () => {
    fetchQueue.push(() => {
      throw new Error("ECONNREFUSED");
    });
    const out = await NVRService._fetchCamerasFromNvr(
      "hikvision",
      "10.0.0.10",
      80,
      "admin",
      "secret",
    );
    expect(out).toEqual({ error: "ECONNREFUSED" });
  });
});
