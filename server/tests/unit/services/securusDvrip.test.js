import { describe, expect, it } from "vitest";
import net from "net";
import {
  buildBinaryLogin,
  buildDvripPacket,
  buildFileQuery,
  openSecurusPlaybackSource,
  parseFileQueryResponse,
  searchSecurusRecordings,
  sofiaPasswordHash,
  toDeviceLocalIso,
} from "../../../core/v2/NVR/securusDvrip.js";
import { rewriteSecurusPlaylist } from "../../../core/v2/NVR/securusPlayback.js";

function writeDeviceTime(buffer, offset, date) {
  [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    0,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    0,
  ].forEach((value, index) => buffer.writeUInt32LE(value, offset + index * 4));
}

describe("Securus DVRIP protocol", () => {
  it("uses the Sofia password digest expected by XiongMai devices", () => {
    expect(sofiaPasswordHash("admin")).toBe("6QNMIQGe");
  });

  it("serializes NVR wall time without applying a server timezone", () => {
    expect(toDeviceLocalIso(new Date(2026, 9, 1, 0, 20, 59))).toBe("2026-10-01T00:20:59");
  });

  it("builds the captured binary login packet shape", () => {
    const packet = buildBinaryLogin("admin", "admin");
    expect(packet).toHaveLength(92);
    expect(packet[0]).toBe(0xff);
    expect(packet[2]).toBe(1);
    expect(packet.readUInt16LE(14)).toBe(1000);
    expect(packet.readUInt32LE(16)).toBe(72);
    expect(packet.subarray(20, 25).toString()).toBe("admin");
    expect(packet.subarray(52, 60).toString()).toBe("6QNMIQGe");
    expect(packet.readUInt32LE(84)).toBe(1);
    expect(packet.readUInt32LE(88)).toBe(2);
  });

  it("encodes a native file search with device-local times", () => {
    const start = new Date(2026, 9, 1, 0, 0, 0);
    const end = new Date(2026, 9, 1, 0, 20, 59);
    const packet = buildFileQuery(123, 4, start, end, 2);
    expect(packet.readUInt16LE(14)).toBe(1440);
    expect(packet.readUInt32LE(20)).toBe(123);
    expect(packet.readUInt32LE(24)).toBe(0);
    expect(packet.readUInt32LE(32)).toBe(1);
    expect(packet.subarray(36, 40).toString()).toBe("h264");
    expect(packet.readUInt32LE(60)).toBe(0x2a);
    expect(packet.readUInt32LE(92)).toBe(0xffff);
    expect(packet.readUInt32LE(96)).toBe(2026);
    expect(packet.readUInt32LE(112)).toBe(0);
    expect(packet.readUInt32LE(144)).toBe(0);
    expect(packet.readUInt32LE(148)).toBe(20);
    expect(packet.readUInt32LE(152)).toBe(59);
  });

  it("parses and filters recording descriptors by channel path", () => {
    const payload = Buffer.alloc(28 + 184);
    payload.writeUInt32LE(100, 4);
    payload.writeUInt32LE(1, 16);
    payload.writeUInt32LE(2048, 28);
    const recordingPath = "/mnt/sda0/2026-10-01/001/00.00.00-00.01.59.h264";
    Buffer.from(recordingPath).copy(payload, 32);
    writeDeviceTime(payload, 140, new Date(2026, 9, 1, 0, 0, 0));
    writeDeviceTime(payload, 172, new Date(2026, 9, 1, 0, 1, 59));

    const recordings = parseFileQueryResponse(payload, 1);
    expect(recordings).toHaveLength(1);
    expect(recordings[0].path).toBe(recordingPath);
    expect(recordings[0].size).toBe(2048);
    expect(parseFileQueryResponse(payload, 2)).toEqual([]);
  });

  it("paginates a capped recording-index response without dropping the boundary file", async () => {
    const sockets = new Set();
    let queryCount = 0;

    const buildSearchResponse = (count, firstMinute) => {
      const payload = Buffer.alloc(28 + count * 184);
      payload.writeUInt32LE(100, 4);
      payload.writeUInt32LE(count, 16);
      for (let index = 0; index < count; index += 1) {
        const offset = 28 + index * 184;
        const start = new Date(2026, 9, 1, 0, firstMinute + index, 0);
        const end = new Date(start.getTime() + 60 * 1000);
        const path = `/mnt/idea0/2026-10-01/001/page-${firstMinute + index}.h264`;
        payload.writeUInt32LE(1024, offset);
        Buffer.from(path).copy(payload, offset + 4);
        writeDeviceTime(payload, offset + 112, start);
        writeDeviceTime(payload, offset + 144, end);
      }
      return payload;
    };

    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let buffered = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length >= 20) {
          const length = buffered.readUInt32LE(16);
          if (buffered.length < 20 + length) return;
          const packet = buffered.subarray(0, 20 + length);
          buffered = buffered.subarray(20 + length);
          const messageId = packet.readUInt16LE(14);
          if (messageId === 1000) {
            const response = Buffer.alloc(12);
            response.writeUInt32LE(100, 8);
            socket.write(buildDvripPacket(0x96, 0, 1001, response));
          } else if (messageId === 1440) {
            queryCount += 1;
            const response = queryCount === 1
              ? buildSearchResponse(64, 0)
              : buildSearchResponse(1, 64);
            socket.write(buildDvripPacket(0x96, queryCount, 1441, response));
          }
        }
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const recordings = await searchSecurusRecordings({
        ip: "127.0.0.1",
        port: server.address().port,
        username: "admin",
        password: "admin",
        channelId: 1,
        start: new Date(2026, 9, 1, 0, 0, 0),
        end: new Date(2026, 9, 1, 2, 0, 0),
        timeoutMs: 1000,
      });
      expect(queryCount).toBe(2);
      expect(recordings).toHaveLength(65);
      expect(recordings.at(-1).path).toContain("page-64.h264");
    } finally {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("claims the media connection before starting playback", async () => {
    const sockets = new Set();
    let connectionCount = 0;
    let mediaSocket;
    const protocolOrder = [];
    let resolveOrder;
    const orderChecked = new Promise((resolve) => { resolveOrder = resolve; });

    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      connectionCount += 1;

      if (connectionCount === 2) {
        mediaSocket = socket;
      }

      let buffered = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length >= 20) {
          const length = buffered.readUInt32LE(16);
          if (buffered.length < 20 + length) return;
          const packet = buffered.subarray(0, 20 + length);
          buffered = buffered.subarray(20 + length);
          const messageId = packet.readUInt16LE(14);
          if (messageId === 1000) {
            const response = Buffer.alloc(12);
            response.writeUInt32LE(100, 8);
            socket.write(buildDvripPacket(0x96, 0, 1001, response));
          } else if (messageId === 1440) {
            const response = Buffer.alloc(28);
            response.writeUInt32LE(100, 4);
            socket.write(buildDvripPacket(0x96, 1, 1441, response));
          } else if (messageId === 1424) {
            protocolOrder.push("claim");
            expect(packet.subarray(20).readUInt32LE(12)).toBe(7);
            const response = Buffer.alloc(8);
            response.writeUInt32LE(100, 4);
            socket.write(buildDvripPacket(0x96, 1, 1425, response));
          } else if (messageId === 1420) {
            protocolOrder.push("start");
            const response = Buffer.alloc(8);
            response.writeUInt32LE(100, 4);
            socket.write(buildDvripPacket(0x96, 1, 1421, response));
            const mediaPayload = Buffer.from([
              0x00, 0x00, 0x01, 0xfd, 0x02, 0x00,
              0x00, 0x00, 0x00, 0x01, 0x67, 0x64, 0x00, 0x2a,
            ]);
            protocolOrder.push("media");
            mediaSocket.write(buildDvripPacket(0x96, 2, 1422, mediaPayload));
            resolveOrder(protocolOrder);
          }
        }
      });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const source = await openSecurusPlaybackSource({
      ip: "127.0.0.1",
      port: server.address().port,
      username: "admin",
      password: "admin",
      recordings: [{
        path: "/mnt/idea0/2026-10-01/001/test.h264",
        start_time: "20261001T000000Z",
        end_time: "20261001T000100Z",
      }],
      timeoutMs: 1000,
    });

    try {
      await expect(orderChecked).resolves.toEqual(["claim", "start", "media"]);
      await expect(source.codec).resolves.toBe("h264");
    } finally {
      source.stop();
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("Securus HLS proxy", () => {
  it("adds the access token to every media segment", () => {
    const source = "#EXTM3U\n#EXTINF:2.0,\nsegment_000001.ts\n";
    expect(rewriteSecurusPlaylist(source, "a+b/c=")).toContain(
      "segment_000001.ts?token=a%2Bb%2Fc%3D",
    );
  });
});
