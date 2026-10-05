import { createHash } from "crypto";
import net from "net";
import { PassThrough } from "stream";

const DVRIP_PORT = 34567;
const HEADER_SIZE = 20;
const MAX_PAYLOAD_SIZE = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const FILE_QUERY = 1440;
const FILE_QUERY_RESPONSE = 1441;
const FILE_QUERY_PAGE_SIZE = 64;
const MAX_FILE_QUERY_PAGES = 128;
const PLAYBACK = 1420;
const PLAYBACK_RESPONSE = 1421;
const MEDIA = 1422;
const playbackStartLocks = new Map();

/** XiongMai/Sofia's legacy eight-character password digest. */
export function sofiaPasswordHash(password = "") {
  const digest = createHash("md5").update(String(password)).digest();
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let index = 0; index < digest.length; index += 2) {
    result += alphabet[(digest[index] + digest[index + 1]) % alphabet.length];
  }
  return result;
}

export function buildDvripPacket(sessionId, sequence, messageId, payload = Buffer.alloc(0), login = false) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(HEADER_SIZE);
  header[0] = 0xff;
  // The captured WebCtrl/NetSDK login uses protocol version 1 in byte 2.
  if (login) header[2] = 1;
  header.writeUInt32LE(sessionId >>> 0, 4);
  header.writeUInt32LE(sequence >>> 0, 8);
  header.writeUInt16LE(messageId, 14);
  header.writeUInt32LE(body.length, 16);
  return Buffer.concat([header, body]);
}

export function buildBinaryLogin(username, password) {
  const body = Buffer.alloc(72);
  Buffer.from(String(username || "admin"), "utf8").copy(body, 0, 0, 31);
  Buffer.from(sofiaPasswordHash(password), "ascii").copy(body, 32, 0, 31);
  body.writeUInt32LE(1, 64);
  body.writeUInt32LE(2, 68);
  return buildDvripPacket(0, 0, 1000, body, true);
}

function writeDeviceTime(buffer, offset, date) {
  const values = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    // NET_TIME_EX includes a weekday field between day and hour. The web
    // client sends zero here; omitting it shifts every non-midnight request.
    0,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    0,
  ];
  values.forEach((value, index) => buffer.writeUInt32LE(value, offset + index * 4));
}

function readDeviceTime(buffer, offset) {
  if (buffer.length < offset + 28) return null;
  const year = buffer.readUInt32LE(offset);
  const month = buffer.readUInt32LE(offset + 4);
  const day = buffer.readUInt32LE(offset + 8);
  const hour = buffer.readUInt32LE(offset + 16);
  const minute = buffer.readUInt32LE(offset + 20);
  const second = buffer.readUInt32LE(offset + 24);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function buildFileQuery(sessionId, sequence, start, end, channelId = 1) {
  const body = Buffer.alloc(140);
  body.writeUInt32LE(sessionId >>> 0, 0);
  // This WebCtrl binary layout stores the zero-based channel at offset 12;
  // our channel model and recording paths are one-based (1 -> /001/).
  body.writeUInt32LE(Math.max(0, (Number(channelId) || 1) - 1), 12);
  Buffer.from("h264\0", "ascii").copy(body, 16);
  // 0x2a = all recording types; 0xffff is the channel selector used by the
  // Securus WebCtrl. Results are filtered by their /NNN/ recording path.
  body.writeUInt32LE(0x2a, 40);
  body.writeUInt32LE(0xffff, 72);
  writeDeviceTime(body, 76, start);
  writeDeviceTime(body, 108, end);
  return buildDvripPacket(sessionId, sequence, FILE_QUERY, body);
}

export function parseFileQueryResponse(payload, channelId) {
  if (!Buffer.isBuffer(payload) || payload.length < 28) return [];
  const returnCode = payload.readUInt32LE(4);
  if (returnCode !== 100) throw new Error(`Securus recording search failed (Ret=${returnCode})`);

  const count = Math.min(payload.readUInt32LE(16), 4096);
  const paddedChannel = String(Number(channelId) || 1).padStart(3, "0");
  const recordings = [];
  const recordStart = 28;
  const recordSize = 184;

  for (let index = 0; index < count; index += 1) {
    const offset = recordStart + index * recordSize;
    if (offset + recordSize > payload.length) break;
    const pathBytes = payload.subarray(offset + 4, offset + 112);
    const nul = pathBytes.indexOf(0);
    const path = pathBytes.subarray(0, nul < 0 ? pathBytes.length : nul).toString("utf8");
    const start = readDeviceTime(payload, offset + 112);
    const end = readDeviceTime(payload, offset + 144);
    if (!path.startsWith("/mnt/") || !start || !end) continue;
    if (!path.includes(`/${paddedChannel}/`)) continue;
    recordings.push({
      path,
      start,
      end,
      size: payload.readUInt32LE(offset),
    });
  }
  return recordings;
}

class DvripReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.queue = [];
    this.waiters = [];
    this.failure = null;
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parse();
    });
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("Securus DVRIP connection closed")));
  }

  parse() {
    while (this.buffer.length >= HEADER_SIZE) {
      if (this.buffer[0] !== 0xff) {
        const next = this.buffer.indexOf(0xff, 1);
        this.buffer = next < 0 ? Buffer.alloc(0) : this.buffer.subarray(next);
        continue;
      }
      const length = this.buffer.readUInt32LE(16);
      if (length > MAX_PAYLOAD_SIZE) {
        this.fail(new Error(`Invalid Securus DVRIP payload length ${length}`));
        return;
      }
      if (this.buffer.length < HEADER_SIZE + length) return;
      const message = {
        sessionId: this.buffer.readUInt32LE(4),
        sequence: this.buffer.readUInt32LE(8),
        messageId: this.buffer.readUInt16LE(14),
        payload: Buffer.from(this.buffer.subarray(HEADER_SIZE, HEADER_SIZE + length)),
      };
      this.buffer = this.buffer.subarray(HEADER_SIZE + length);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message);
      else this.queue.push(message);
    }
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error;
    this.waiters.splice(0).forEach(({ reject }) => reject(error));
  }

  next(timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Timed out waiting for Securus DVRIP response"));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
}

async function waitForMessage(reader, messageId) {
  for (;;) {
    const message = await reader.next();
    if (message.messageId === messageId) return message;
  }
}

function connectSocket(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out connecting to Securus NVR"));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.setKeepAlive(true, 10000);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function withPlaybackStartLock(key, operation) {
  const previous = playbackStartLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  playbackStartLocks.set(key, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (playbackStartLocks.get(key) === current) playbackStartLocks.delete(key);
  }
}

/** Search the native Securus/XiongMai recording index. */
export async function searchSecurusRecordings({
  ip,
  port = DVRIP_PORT,
  username = "admin",
  password = "",
  channelId = 1,
  start,
  end,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime()) ||
      !(end instanceof Date) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid Securus recording search range");
  }

  const socket = await connectSocket(ip, Number(port) || DVRIP_PORT, timeoutMs);
  const reader = new DvripReader(socket);
  try {
    socket.write(buildBinaryLogin(username, password));
    const login = await waitForMessage(reader, 1001);
    const returnCode = login.payload.length >= 12 ? login.payload.readUInt32LE(8) : 0;
    if (returnCode !== 100) throw new Error(`Securus DVRIP login failed (Ret=${returnCode})`);

    const recordings = [];
    const seen = new Set();
    let cursor = new Date(start);

    for (let page = 0; page < MAX_FILE_QUERY_PAGES && cursor < end; page += 1) {
      socket.write(buildFileQuery(login.sessionId, page + 1, cursor, end, channelId));
      const response = await waitForMessage(reader, FILE_QUERY_RESPONSE);
      const pageRecordings = parseFileQueryResponse(response.payload, channelId)
        .sort((left, right) => left.start - right.start || left.end - right.end);
      for (const recording of pageRecordings) {
        const key = `${recording.path}:${recording.start.getTime()}:${recording.end.getTime()}`;
        if (!seen.has(key)) {
          seen.add(key);
          recordings.push(recording);
        }
      }

      const declaredCount = response.payload.length >= 20
        ? response.payload.readUInt32LE(16)
        : 0;
      if (declaredCount < FILE_QUERY_PAGE_SIZE || pageRecordings.length === 0) break;

      // Include the boundary again on the next page and de-duplicate it. This
      // avoids skipping a file whose start equals the previous file's end.
      const nextCursor = pageRecordings.reduce(
        (latest, recording) => recording.end > latest ? recording.end : latest,
        cursor,
      );
      if (nextCursor <= cursor) break;
      cursor = new Date(nextCursor);
    }

    return recordings.sort((left, right) => left.start - right.start || left.end - right.end);
  } finally {
    socket.destroy();
  }
}

export function toCompactDeviceTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}Z`;
}

/** ISO-shaped device wall time without a timezone conversion. */
export function toDeviceLocalIso(date) {
  const compact = toCompactDeviceTime(date);
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` +
    `T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}`;
}

/** Parse the app's compact local-wall-clock timestamp without treating Z as UTC. */
export function parseCompactDeviceTime(value) {
  const match = String(value || "").match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
  );
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid Securus playback time");
    return parsed;
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid Securus playback time");
  return parsed;
}

function buildPlaybackBody(sessionId, recording, action) {
  const path = String(recording?.path || "");
  if (!path.startsWith("/mnt/") || Buffer.byteLength(path) > 107) {
    throw new Error("Invalid Securus recording path");
  }
  const start = parseCompactDeviceTime(recording.start_time || recording.startTime);
  const end = parseCompactDeviceTime(recording.end_time || recording.endTime);
  const body = Buffer.alloc(200);
  body.writeUInt32LE(sessionId >>> 0, 0);
  body.writeUInt32LE(action >>> 0, 12);
  Buffer.from(path, "utf8").copy(body, 20, 0, 107);
  writeDeviceTime(body, 128, start);
  writeDeviceTime(body, 160, end);
  return body;
}

function parseMediaFrame(payload) {
  if (!Buffer.isBuffer(payload) || payload.length < 8 ||
      payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1 ||
      ![0xfc, 0xfd, 0xfe].includes(payload[3])) {
    return null;
  }
  const annexB = payload.indexOf(Buffer.from([0, 0, 0, 1]), 4);
  if (annexB < 0) return null;
  let codec = null;
  // FD/FE carry the extended key-frame header; byte 4 is the codec marker.
  if (payload[3] === 0xfd || payload[3] === 0xfe) {
    codec = payload[4] === 0x12 ? "hevc" : "h264";
  }
  return { data: payload.subarray(annexB), codec };
}

async function loginBinary(socket, reader, username, password) {
  socket.write(buildBinaryLogin(username, password));
  const login = await waitForMessage(reader, 1001);
  const returnCode = login.payload.length >= 12 ? login.payload.readUInt32LE(8) : 0;
  if (returnCode !== 100) throw new Error(`Securus DVRIP login failed (Ret=${returnCode})`);
  return login.sessionId;
}

function responseSucceeded(message) {
  return message?.payload?.length >= 8 && message.payload.readUInt32LE(4) === 100;
}

function buildKeepAlive(sessionId, sequence) {
  const sessionHex = `0x${sessionId.toString(16).padStart(8, "0")}`;
  const payload = Buffer.from(`${JSON.stringify({
    Name: "KeepAlive",
    SessionID: sessionHex,
  })}\0`);
  return buildDvripPacket(sessionId, sequence, 1006, payload);
}

/**
 * Open native Securus playback and expose clean Annex-B H.264/H.265 bytes.
 * The returned stream is suitable for FFmpeg stdin; stop() closes both DVRIP
 * sockets and is idempotent.
 */
export async function openSecurusPlaybackSource({
  ip,
  port = DVRIP_PORT,
  username = "admin",
  password = "",
  recordings = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!Array.isArray(recordings) || recordings.length === 0) {
    throw new Error("Securus playback requires at least one recording");
  }
  // Validate all device-returned paths before opening a socket.
  const recordingTimes = recordings.map((recording) => {
    buildPlaybackBody(1, recording, 0);
    return {
      start: parseCompactDeviceTime(recording.start_time || recording.startTime),
      end: parseCompactDeviceTime(recording.end_time || recording.endTime),
    };
  });

  const control = await connectSocket(ip, Number(port) || DVRIP_PORT, timeoutMs);
  const controlReader = new DvripReader(control);
  let sessionId;
  try {
    sessionId = await loginBinary(control, controlReader, username, password);
    // WebCtrl performs the file query and playback start on the same session.
    // A fresh session that sends only 1420 receives success but its following
    // media connection stays silent on this firmware.
    control.write(buildFileQuery(
      sessionId,
      1,
      recordingTimes[0].start,
      recordingTimes.at(-1).end,
      Number(String(recordings[0].path).match(/\/(\d{3})\//)?.[1]) || 1,
    ));
    const indexed = await waitForMessage(controlReader, FILE_QUERY_RESPONSE);
    if (!responseSucceeded(indexed)) throw new Error("Securus playback index lookup was rejected");
  } catch (error) {
    control.destroy();
    throw error;
  }

  const output = new PassThrough({ highWaterMark: 1024 * 1024 });
  // The producer starts before the caller awaits codec; retain the error for
  // the codec promise without allowing EventEmitter's unhandled-error crash.
  output.on("error", () => undefined);
  let media = null;
  let stopped = false;
  let keepAlive = null;
  let keepAliveSequence = 1000;
  let settledCodec = false;
  let resolveCodec;
  let rejectCodec;
  const codec = new Promise((resolve, reject) => {
    resolveCodec = resolve;
    rejectCodec = reject;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(keepAlive);
    media?.destroy();
    control.destroy();
    if (!output.destroyed) output.end();
  };

  keepAlive = setInterval(() => {
    if (!stopped && !control.destroyed) {
      control.write(buildKeepAlive(sessionId, keepAliveSequence++));
    }
  }, 15000);
  keepAlive.unref?.();

  const pump = async () => {
    let sequence = 2;
    try {
      for (const recording of recordings) {
        if (stopped) break;
        // WebCtrl claims a dedicated media socket with message 1424/action 7,
        // waits for 1425, and only then starts the file on the authenticated
        // control socket with message 1420/action 0. The NVR sends 1422 video
        // frames over the claimed socket after acknowledging the start.
        const mediaReader = await withPlaybackStartLock(
          `${ip}:${Number(port) || DVRIP_PORT}`,
          async () => {
            media = await connectSocket(ip, Number(port) || DVRIP_PORT, timeoutMs);
            const reader = new DvripReader(media);
            media.write(buildDvripPacket(
              sessionId,
              0,
              1424,
              buildPlaybackBody(sessionId, recording, 7),
            ));
            const claimed = await waitForMessage(reader, 1425);
            if (!responseSucceeded(claimed)) throw new Error("Securus playback media claim was rejected");

            control.write(buildDvripPacket(
              sessionId,
              sequence++,
              PLAYBACK,
              buildPlaybackBody(sessionId, recording, 0),
            ));
            const started = await waitForMessage(controlReader, PLAYBACK_RESPONSE);
            if (!responseSucceeded(started)) throw new Error("Securus playback request was rejected");
            return reader;
          },
        );

        // Each physical file is short. Silence/EOF means advance to the next
        // descriptor from the same recording-index query.
        while (!stopped) {
          let message;
          try {
            message = await mediaReader.next(7000);
          } catch (error) {
            if (/Timed out|closed/i.test(error.message)) break;
            throw error;
          }
          if (message.messageId !== MEDIA) continue;
          const frame = parseMediaFrame(message.payload);
          if (!frame) continue;
          if (frame.codec && !settledCodec) {
            settledCodec = true;
            resolveCodec(frame.codec);
          }
          if (!output.write(frame.data)) {
            await new Promise((resolve) => output.once("drain", resolve));
          }
        }
        media.destroy();
        media = null;
      }
      if (!settledCodec) {
        settledCodec = true;
        rejectCodec(new Error("Securus playback returned no decodable video frames"));
      }
      if (!output.destroyed) output.end();
    } catch (error) {
      if (!settledCodec) {
        settledCodec = true;
        rejectCodec(error);
      }
      if (!output.destroyed) output.destroy(error);
    } finally {
      stop();
    }
  };

  // Avoid an unhandled rejection if the caller stops before awaiting codec.
  codec.catch(() => undefined);
  pump();
  return { stream: output, codec, stop };
}
