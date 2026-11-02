/**
 * The naming boundary — contract §9.
 *
 * "The frontend never sees snake_case, the service never sees camelCase."
 *
 * Two properties matter here and neither is obvious from reading the code:
 * nothing snake_cased survives into a frontend-bound payload, and a field the
 * contract does not name is DROPPED rather than forwarded under a camelCased
 * alias.
 */
import { describe, it, expect } from "vitest";
import {
  sessionFromService,
  promptFromService,
  statusFromService,
  objectFromService,
  maskFromService,
  stateFromService,
  sessionToService,
  promptToService,
} from "../../../core/v2/xray/xray.translate.js";

/** No key anywhere in the structure may contain an underscore. */
const keysWithUnderscores = (value, path = "") => {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysWithUnderscores(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) => [
      ...(key.includes("_") ? [`${path}.${key}`] : []),
      ...keysWithUnderscores(v, `${path}.${key}`),
    ]);
  }
  return [];
};

describe("service -> Node", () => {
  it("camelCases a session response", () => {
    expect(
      sessionFromService({
        session_id: "deadbeef",
        width: 1920,
        height: 1080,
        frame_rate: 5.0,
        lost_after_frames: 25,
        max_objects: 1,
      }),
    ).toEqual({
      sessionId: "deadbeef",
      width: 1920,
      height: 1080,
      frameRate: 5,
      lostAfterFrames: 25,
      maxObjects: 1,
    });
  });

  // The whole reason these are explicit maps rather than a generic walker. A
  // walker would forward this to the browser as `debugInternalState`, a field
  // the contract never promised and the frontend could start depending on.
  it("drops a field the contract does not name", () => {
    const translated = sessionFromService({
      session_id: "a",
      debug_internal_state: { gpu: "busy" },
      secret_token: "leak",
    });

    expect(translated).not.toHaveProperty("debugInternalState");
    expect(translated).not.toHaveProperty("debug_internal_state");
    expect(translated).not.toHaveProperty("secretToken");
    expect(JSON.stringify(translated)).not.toContain("leak");
  });

  it("survives a missing or empty body without throwing", () => {
    expect(() => sessionFromService()).not.toThrow();
    expect(() => promptFromService(null)).not.toThrow();
    expect(() => statusFromService({})).not.toThrow();
    expect(() => maskFromService(undefined)).not.toThrow();
    expect(sessionFromService().sessionId).toBe("");
    expect(sessionFromService().width).toBe(0);
  });

  it("defaults maxObjects to 1, the contract's v1 cap", () => {
    // Contract §13.4: one object per session in v1. Defaulting to 0 would make
    // the frontend believe no object may ever be tracked.
    expect(sessionFromService({}).maxObjects).toBe(1);
  });

  it("coerces a numeric string and rejects a non-number", () => {
    expect(sessionFromService({ width: "1920" }).width).toBe(1920);
    expect(sessionFromService({ width: "wide" }).width).toBe(0);
    expect(sessionFromService({ width: null }).width).toBe(0);
  });

  it("camelCases a prompt response", () => {
    expect(promptFromService({ obj_id: "obj-a1b2c3d4", resolved_seq: 12345, resolved_offset: 1.19 })).toEqual({
      objId: "obj-a1b2c3d4",
      resolvedSeq: 12345,
      resolvedOffset: 1.19,
    });
  });

  it("camelCases a status response and its nested objects", () => {
    const translated = statusFromService({
      session_id: "sess1",
      state: "tracking",
      reason: null,
      frames_behind_live: 142,
      objects: [
        { obj_id: "obj-1", bbox: [10, 20, 30, 40], polygon: [[[10, 20], [40, 20], [40, 60]]] },
      ],
    });

    expect(translated.framesBehindLive).toBe(142);
    expect(translated.objects[0].objId).toBe("obj-1");
    expect(keysWithUnderscores(translated)).toEqual([]);
  });

  // Contract §7's five state strings are a SHARED vocabulary — identical in the
  // service, in Mongo, in the socket.io events and in the UI. Translating one
  // would break all four at once.
  it.each(["preparing", "ready", "tracking", "lost", "ended"])(
    "passes the state %s through verbatim",
    (state) => {
      expect(statusFromService({ state }).state).toBe(state);
      expect(stateFromService({ state }).state).toBe(state);
    },
  );

  it("keeps reason null unless the service sent one", () => {
    expect(stateFromService({ state: "lost" }).reason).toBeNull();
    expect(stateFromService({ state: "lost", reason: null }).reason).toBeNull();
    expect(stateFromService({ state: "ended", reason: "object_lost" }).reason).toBe("object_lost");
  });

  it("camelCases a mask message", () => {
    const translated = maskFromService({
      type: "mask",
      session_id: "sess1",
      seq: 12345,
      offset: 1.24,
      emitted_at: 1792345678.912,
      objects: [{ obj_id: "obj-1", bbox: [1, 2, 3, 4], polygon: [[[1, 2]]] }],
    });

    expect(translated).toEqual({
      sessionId: "sess1",
      seq: 12345,
      offset: 1.24,
      emittedAt: 1792345678.912,
      objects: [{ objId: "obj-1", bbox: [1, 2, 3, 4], polygon: [[[1, 2]]] }],
    });
    // `type` is the WebSocket envelope, not part of the frontend payload (§9).
    expect(translated).not.toHaveProperty("type");
  });

  // Contract §8: "objects contains only objects visible in that frame. An
  // absent object is omitted — never sent with an empty mask." So an empty list
  // is a meaningful statement, not a malformed message.
  it("keeps an empty object list as an empty list", () => {
    expect(maskFromService({ session_id: "s", objects: [] }).objects).toEqual([]);
    expect(maskFromService({ session_id: "s" }).objects).toEqual([]);
  });

  // Contract §8 is explicit that neither exists on the wire: `score` because a
  // click-seeded track has no meaningful confidence, `rle` because it belongs
  // only in the harvest record.
  it("never emits score or rle, even when the service sends them", () => {
    const object = objectFromService({ obj_id: "o", bbox: [], polygon: [], score: 0.99, rle: "xx" });

    expect(object).not.toHaveProperty("score");
    expect(object).not.toHaveProperty("rle");
    expect(Object.keys(object).sort()).toEqual(["bbox", "objId", "polygon"]);
  });

  it("passes polygon rings through untouched", () => {
    // Ring 0 is the outer boundary (§8); the rest are holes. Reordering or
    // flattening them would redraw the shape.
    const polygon = [
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[2, 2], [4, 2], [4, 4]],
    ];
    expect(objectFromService({ obj_id: "o", polygon }).polygon).toBe(polygon);
  });

  it("tolerates a non-array bbox or polygon", () => {
    expect(objectFromService({ obj_id: "o", bbox: null, polygon: "nope" })).toEqual({
      objId: "o",
      bbox: [],
      polygon: [],
    });
  });
});

describe("Node -> service", () => {
  it("snake_cases a session request to exactly the five contract fields", () => {
    const body = sessionToService({
      cameraId: "cam",
      nvrId: "nvr",
      adminId: "admin",
      userId: "tenant",
      streamUrl: "http://s/stream/x/playlist.m3u8",
    });

    expect(body).toEqual({
      camera_id: "cam",
      nvr_id: "nvr",
      admin_id: "admin",
      user_id: "tenant",
      stream_url: "http://s/stream/x/playlist.m3u8",
    });
    expect(Object.keys(body)).toHaveLength(5);
  });

  it("does not forward an extra field to the service", () => {
    const body = sessionToService({ cameraId: "cam", socketId: "sock", internalNote: "x" });

    expect(body).not.toHaveProperty("socket_id");
    expect(body).not.toHaveProperty("internal_note");
    expect(Object.keys(body)).toHaveLength(5);
  });

  it("snake_cases a prompt request", () => {
    expect(promptToService({ xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 })).toEqual({
      x_norm: 0.431,
      y_norm: 0.662,
      seq: 12345,
      offset: 1.24,
    });
  });

  it("sends 0 rather than undefined for a missing coordinate", () => {
    // The service would reject undefined; 0 is a valid in-range coordinate and
    // validation upstream has already guaranteed the field is present.
    expect(promptToService({})).toEqual({ x_norm: 0, y_norm: 0, seq: 0, offset: 0 });
  });
});

describe("no snake_case reaches a frontend-bound payload", () => {
  const serviceShapes = [
    ["session", sessionFromService, { session_id: "a", frame_rate: 5, lost_after_frames: 25, max_objects: 1 }],
    ["prompt", promptFromService, { obj_id: "o", resolved_seq: 1, resolved_offset: 2 }],
    [
      "status",
      statusFromService,
      { session_id: "a", frames_behind_live: 1, objects: [{ obj_id: "o", bbox: [], polygon: [] }] },
    ],
    [
      "mask",
      maskFromService,
      { session_id: "a", emitted_at: 1, objects: [{ obj_id: "o", bbox: [], polygon: [] }] },
    ],
    ["state", stateFromService, { session_id: "a", frames_behind_live: 1 }],
  ];

  it.each(serviceShapes)("%s", (_name, translate, input) => {
    expect(keysWithUnderscores(translate(input))).toEqual([]);
  });
});
