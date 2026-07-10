/**
 * Extra branch coverage for NVRService — targets paths the existing
 * nvr.service.test.js skips:
 *   1. getNVRLocations memberId branch — filters to authorizedLocations.
 *   2. getAllNvrs memberId branch — scopes to authorizedChannel.nvrIds and
 *      applies skip/limit.
 *   3. testRtspConnection — the pure socket helper. We stub `net` so no
 *      real TCP socket is opened.
 *
 * Mocks: delete.service + nvr.brands (consistency with the sibling suite)
 * + net = 3 mocks total.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteNVR: vi.fn().mockResolvedValue(true) },
}));
vi.mock("../../../core/v1/NVR/nvr.brands.js", () => ({
  default: {},
  updateHandlers: {},
}));

// `net.createConnection` is wired through a small in-memory event emitter so
// we can drive the connect / error / timeout branches deterministically.
const socketFactory = vi.hoisted(() => {
  return {
    nextOutcome: "connect", // "connect" | "error" | "timeout"
    lastArgs: null,
  };
});
vi.mock("net", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    default: {
      createConnection(opts, onConnect) {
        socketFactory.lastArgs = opts;
        const sock = new EventEmitter();
        sock.destroy = vi.fn();
        // Defer the outcome to the next microtask so the caller has time to
        // attach its own listeners (mirrors real socket behavior).
        queueMicrotask(() => {
          if (socketFactory.nextOutcome === "connect") onConnect();
          else if (socketFactory.nextOutcome === "error")
            sock.emit("error", new Error("boom"));
          else if (socketFactory.nextOutcome === "timeout")
            sock.emit("timeout");
        });
        return sock;
      },
    },
    createConnection(opts, onConnect) {
      return this.default.createConnection(opts, onConnect);
    },
  };
});

const { default: NVRService } = await import(
  "../../../core/v1/NVR/nvr.service.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

const USER_ID = "8101";

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

function makeNvr(over = {}) {
  return NVR.create({
    userId: USER_ID,
    nvrName: "NVR-X",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "loc-1",
    ...over,
  });
}

describe("NVRService.getNVRLocations — memberId branch", () => {
  it("filters distinct NVR locations down to authorizedLocations", async () => {
    await makeNvr({ localNvrId: "a", location: "HQ" });
    await makeNvr({ localNvrId: "b", location: "Branch" });
    await makeNvr({ localNvrId: "c", location: "Warehouse" });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      memberId: "member-7",
      authorizedChannel: { locations: ["HQ", "Warehouse"] },
    });
    await NVRService.getNVRLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations.sort()).toEqual(["HQ", "Warehouse"]);
  });

  it("returns an empty list when no authorizedLocations match", async () => {
    await makeNvr({ localNvrId: "a", location: "HQ" });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      memberId: "member-7",
      authorizedChannel: { locations: ["Nowhere"] },
    });
    await NVRService.getNVRLocations(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.locations).toEqual([]);
  });
});

describe("NVRService.getAllNvrs — memberId branch (authorized scoping)", () => {
  it("returns only NVRs whose _id is in authorizedChannel.nvrIds, with skip/limit", async () => {
    const admin = await Admin.create({
      user_id: USER_ID,
      login: "admin",
      email: "n2@test.com",
    });
    const allowed1 = await makeNvr({ localNvrId: "ok-1", nvrName: "Allowed-1" });
    const allowed2 = await makeNvr({ localNvrId: "ok-2", nvrName: "Allowed-2" });
    const denied = await makeNvr({ localNvrId: "no-1", nvrName: "Denied" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: USER_ID,
      memberId: "member-7",
      authorizedChannel: { nvrIds: [allowed1._id, allowed2._id] },
      query: { skip: "0", limit: "10" },
    });
    await NVRService.getAllNvrs(req, res, next);
    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.total).toBe(2);
    const names = data.nvrs.map((n) => n.nvrName).sort();
    expect(names).toEqual(["Allowed-1", "Allowed-2"]);
    expect(names).not.toContain("Denied");
    // The denied NVR exists in the collection — proves we're filtering.
    expect(denied).toBeTruthy();
  });
});

describe("NVRService.testRtspConnection — pure socket helper", () => {
  it("resolves true when the socket connects", async () => {
    socketFactory.nextOutcome = "connect";
    const ok = await NVRService.testRtspConnection("rtsp://10.0.0.1:5540/stream");
    expect(ok).toBe(true);
    expect(socketFactory.lastArgs).toMatchObject({ host: "10.0.0.1", port: "5540" });
  });

  it("resolves false when the socket emits an error", async () => {
    socketFactory.nextOutcome = "error";
    const ok = await NVRService.testRtspConnection("rtsp://10.0.0.2/stream");
    expect(ok).toBe(false);
    // No explicit port in the URL → falls back to 554.
    expect(socketFactory.lastArgs.port).toBe(554);
  });

  it("resolves false when the socket times out", async () => {
    socketFactory.nextOutcome = "timeout";
    const ok = await NVRService.testRtspConnection("rtsp://10.0.0.3:554/stream");
    expect(ok).toBe(false);
  });

  it("resolves false synchronously on a malformed URL (URL parser throws)", async () => {
    const ok = await NVRService.testRtspConnection("not-a-url");
    expect(ok).toBe(false);
  });
});
