/**
 * Unit tests for core/v2/globalSchedule/globalSchedule.service.js
 *
 * Models are mocked; the validation layer is deliberately NOT mocked, so these
 * exercise the real Joi rules (which reuse the camera-schedule schema) through
 * the service exactly as a request would.
 *
 * The rules that actually matter here:
 *   - ownership: an admin can only touch their own NVRs and schedules
 *   - only detection-configured cameras may be enrolled (spec section 3)
 *   - enrolled cameras must belong to the schedule's NVR
 *   - cameras[].enabled is ENROLMENT, not runtime detection state
 *   - the service never starts/stops anything — that is the runner's job
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  nvrFindOne: null,
  channelFind: null,
  gsFind: null,
  gsFindOne: null,
  gsCreate: null,
  gsFindOneAndDelete: null,
}));

/** Mongoose-ish chain: .populate().sort().lean() all resolve to `value`. */
const chain = (value) => {
  const self = {
    populate: () => self,
    sort: () => self,
    lean: async () => value,
  };
  return self;
};

vi.mock("../../../core/v2/globalSchedule/globalSchedule.model.js", () => ({
  default: {
    find: (...args) => h.gsFind(...args),
    findOne: (...args) => h.gsFindOne(...args),
    create: (...args) => h.gsCreate(...args),
    findOneAndDelete: (...args) => h.gsFindOneAndDelete(...args),
  },
}));

vi.mock("../../../core/v2/channels/channels.model.js", () => ({
  default: { find: (...args) => h.channelFind(...args) },
}));

vi.mock("../../../core/v2/NVR/nvr.model.js", () => ({
  default: { findOne: (...args) => h.nvrFindOne(...args) },
}));

vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { default: service } = await import(
  "../../../core/v2/globalSchedule/globalSchedule.service.js"
);

const ADMIN = "admin-1";
const OTHER_ADMIN = "admin-2";
const NVR_ID = "650000000000000000000a01";
const CAM_CONFIGURED = "650000000000000000000c01";
const CAM_CONFIGURED_2 = "650000000000000000000c02";
const CAM_BARE = "650000000000000000000c03";
const SCHEDULE_ID = "650000000000000000000501";
const DETECTOR = "personalProtectiveEquipmentSettings";

const officeHours = {
  mode: "custom",
  timezone: "Asia/Kolkata",
  days: {
    monday: [{ start: "09:00", end: "18:00" }],
    tuesday: [{ start: "09:00", end: "18:00" }],
    wednesday: [{ start: "09:00", end: "18:00" }],
    thursday: [{ start: "09:00", end: "18:00" }],
    friday: [{ start: "09:00", end: "18:00" }],
    saturday: [],
    sunday: [],
  },
};

const nvrDoc = { _id: NVR_ID, userId: ADMIN, nvrName: "NVR-01", brand: "hikvision", location: "Gate" };

/**
 * A camera with a detector APPLIED to it. Two ways to qualify: currently
 * enabled, or zones drawn for this specific camera. `linkedOnly` builds the
 * third case — linked but never set up — which must NOT count.
 */
const configuredChannel = (id, name) => ({
  _id: id,
  name,
  customName: name,
  userId: ADMIN,
  nvrId: NVR_ID,
  detections: { [DETECTOR]: { id: { _id: "ds-1", settings: {} }, enabled: true } },
});

/** Applied via zones, but currently stopped (e.g. by a schedule). */
const zonedChannel = (id, name) => ({
  _id: id,
  name,
  customName: name,
  userId: ADMIN,
  nvrId: NVR_ID,
  detections: {
    [DETECTOR]: {
      id: { _id: "ds-1", settings: { referencePoints: { [id]: [{ x: 1, y: 2 }] } } },
      enabled: false,
    },
  },
});

/**
 * Linked but never configured for this camera: no zones of its own, not
 * enabled. This is the common case that made every camera list ~19 detectors.
 */
const linkedOnlyChannel = (id, name, extraTypes = []) => ({
  _id: id,
  name,
  customName: name,
  userId: ADMIN,
  nvrId: NVR_ID,
  detections: [DETECTOR, ...extraTypes].reduce(
    (acc, type) => ({
      ...acc,
      // Zones exist for a DIFFERENT camera — the setting is shared, so this
      // must not leak into this camera's list.
      [type]: {
        id: { _id: "ds-shared", settings: { referencePoints: { someOtherCamera: [{ x: 1, y: 1 }] } } },
        enabled: false,
      },
    }),
    {},
  ),
});

/** A camera with no detector linked = not eligible for global scheduling. */
const bareChannel = (id, name) => ({
  _id: id,
  name,
  customName: name,
  userId: ADMIN,
  nvrId: NVR_ID,
  detections: {},
});

/**
 * The shared Response util returns { statusCode, body: { status, message, data } }
 * and handlers pass that whole envelope to res.json — so the payload lives at
 * res.body.body.data.
 */
const payload = (res) => res.body?.body?.data;

const makeRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const makeReq = (overrides = {}) => ({
  verified: { userData: { user_id: ADMIN } },
  params: {},
  query: {},
  body: {},
  ...overrides,
});

beforeEach(() => {
  h.nvrFindOne = vi.fn(({ _id, userId }) =>
    chain(_id === NVR_ID && userId === ADMIN ? nvrDoc : null),
  );
  h.channelFind = vi.fn(() => chain([]));
  h.gsFind = vi.fn(() => chain([]));
  h.gsFindOne = vi.fn(() => chain(null));
  h.gsCreate = vi.fn(async (doc) => ({ _id: SCHEDULE_ID, ...doc }));
  h.gsFindOneAndDelete = vi.fn(async () => null);
});

describe("getNvrCameras — Tab 1 of the UI", () => {
  it("splits cameras into configured and non-configured", async () => {
    h.channelFind = vi.fn(() =>
      chain([
        configuredChannel(CAM_CONFIGURED, "Camera 01"),
        configuredChannel(CAM_CONFIGURED_2, "Camera 02"),
        bareChannel(CAM_BARE, "Camera 05"),
      ]),
    );

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    expect(res.statusCode).toBe(200);
    const data = payload(res);
    expect(data.nvr).toMatchObject({ nvrName: "NVR-01", cameraCount: 3 });
    expect(data.configuredCameras.map((c) => c.name)).toEqual(["Camera 01", "Camera 02"]);
    expect(data.nonConfiguredCameras.map((c) => c.name)).toEqual(["Camera 05"]);
  });

  it("reports which detectors a configured camera has, and their live state", async () => {
    h.channelFind = vi.fn(() => chain([configuredChannel(CAM_CONFIGURED, "Camera 01")]));

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    expect(payload(res).configuredCameras[0].configuredDetectors).toEqual([
      { settingType: DETECTOR, detectionName: expect.any(String), enabled: true },
    ]);
  });

  it("flags cameras already enrolled in a global schedule, ignoring un-enrolled rows", async () => {
    h.channelFind = vi.fn(() =>
      chain([configuredChannel(CAM_CONFIGURED, "Camera 01"), configuredChannel(CAM_CONFIGURED_2, "Camera 02")]),
    );
    h.gsFind = vi.fn(() =>
      chain([
        {
          _id: SCHEDULE_ID,
          name: "Office hours",
          enabled: true,
          cameras: [
            { channelId: CAM_CONFIGURED, enabled: true },
            // Un-enrolled: must NOT be reported as enrolled.
            { channelId: CAM_CONFIGURED_2, enabled: false },
          ],
        },
      ]),
    );

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    expect(Object.keys(payload(res).enrolledCameras)).toEqual([CAM_CONFIGURED]);
    expect(payload(res).enrolledCameras[CAM_CONFIGURED]).toMatchObject({ name: "Office hours" });
  });

  it("404s for an NVR belonging to another admin", async () => {
    const res = makeRes();
    await service.getNvrCameras(
      makeReq({ params: { nvrId: NVR_ID }, verified: { userData: { user_id: OTHER_ADMIN } } }),
      res,
    );

    expect(res.statusCode).toBe(404);
    // Ownership is enforced in the query itself, not by post-filtering.
    expect(h.nvrFindOne).toHaveBeenCalledWith({ _id: NVR_ID, userId: OTHER_ADMIN });
  });
});

describe("createGlobalSchedule", () => {
  const validBody = {
    nvrId: NVR_ID,
    name: "Office hours",
    schedule: officeHours,
    cameras: [{ channelId: CAM_CONFIGURED, enabled: true }],
  };

  beforeEach(() => {
    h.channelFind = vi.fn(() => chain([configuredChannel(CAM_CONFIGURED, "Camera 01")]));
  });

  it("creates a schedule scoped to the requesting admin", async () => {
    const res = makeRes();
    await service.createGlobalSchedule(makeReq({ body: validBody }), res);

    expect(res.statusCode).toBe(201);
    expect(h.gsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ADMIN, nvrId: NVR_ID, enabled: true }),
    );
  });

  it("defaults detectors to empty, meaning every configured detector", async () => {
    const res = makeRes();
    await service.createGlobalSchedule(makeReq({ body: validBody }), res);

    expect(h.gsCreate.mock.calls[0][0].detectors).toEqual([]);
  });

  it("rejects a camera that is not configured for detection", async () => {
    h.channelFind = vi.fn(() => chain([bareChannel(CAM_BARE, "Camera 05")]));

    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({ body: { ...validBody, cameras: [{ channelId: CAM_BARE, enabled: true }] } }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/configured for detection/i);
    expect(h.gsCreate).not.toHaveBeenCalled();
  });

  it("allows an UN-ENROLLED row to reference an unconfigured camera", async () => {
    // enabled:false is inert, so it need not satisfy the configured rule.
    h.channelFind = vi.fn(() => chain([bareChannel(CAM_BARE, "Camera 05")]));

    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({ body: { ...validBody, cameras: [{ channelId: CAM_BARE, enabled: false }] } }),
      res,
    );

    expect(res.statusCode).toBe(201);
  });

  it("rejects a camera that does not belong to the NVR", async () => {
    h.channelFind = vi.fn(() => chain([])); // nothing matched nvrId+userId

    const res = makeRes();
    await service.createGlobalSchedule(makeReq({ body: validBody }), res);

    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/not found on this NVR/i);
  });

  it("rejects duplicate camera entries", async () => {
    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({
        body: {
          ...validBody,
          cameras: [
            { channelId: CAM_CONFIGURED, enabled: true },
            { channelId: CAM_CONFIGURED, enabled: false },
          ],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/duplicate/i);
  });

  it("404s for another admin's NVR", async () => {
    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({ body: validBody, verified: { userData: { user_id: OTHER_ADMIN } } }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(h.gsCreate).not.toHaveBeenCalled();
  });

  describe("validation (real Joi rules, shared with camera schedules)", () => {
    const cases = [
      ["missing nvrId", { schedule: officeHours }],
      ["missing schedule", { nvrId: NVR_ID }],
      ["bad mode", { nvrId: NVR_ID, schedule: { mode: "sometimes" } }],
      [
        "custom mode with no windows",
        { nvrId: NVR_ID, schedule: { mode: "custom", timezone: "Asia/Kolkata", days: {} } },
      ],
      [
        "overlapping windows",
        {
          nvrId: NVR_ID,
          schedule: {
            mode: "custom",
            timezone: "Asia/Kolkata",
            days: { monday: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "14:00" }] },
          },
        },
      ],
      [
        "end before start",
        {
          nvrId: NVR_ID,
          schedule: {
            mode: "custom",
            timezone: "Asia/Kolkata",
            days: { monday: [{ start: "18:00", end: "09:00" }] },
          },
        },
      ],
      [
        "malformed time",
        {
          nvrId: NVR_ID,
          schedule: {
            mode: "custom",
            timezone: "Asia/Kolkata",
            days: { monday: [{ start: "9am", end: "6pm" }] },
          },
        },
      ],
      [
        "unknown detector",
        { nvrId: NVR_ID, schedule: officeHours, detectors: ["notADetector"] },
      ],
    ];

    for (const [name, body] of cases) {
      it(`rejects: ${name}`, async () => {
        const res = makeRes();
        await service.createGlobalSchedule(makeReq({ body }), res);

        expect(res.statusCode).toBe(400);
        expect(h.gsCreate).not.toHaveBeenCalled();
      });
    }

    it("accepts multiple non-overlapping windows in a day", async () => {
      const res = makeRes();
      await service.createGlobalSchedule(
        makeReq({
          body: {
            ...validBody,
            schedule: {
              mode: "custom",
              timezone: "Asia/Kolkata",
              days: {
                monday: [
                  { start: "09:00", end: "12:00" },
                  { start: "14:00", end: "18:00" },
                ],
              },
            },
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(201);
    });

    it("accepts mode 'always' without days", async () => {
      const res = makeRes();
      await service.createGlobalSchedule(
        makeReq({ body: { ...validBody, schedule: { mode: "always" } } }),
        res,
      );

      expect(res.statusCode).toBe(201);
    });
  });
});

describe("updateGlobalSchedule", () => {
  const existingDoc = () => ({
    _id: SCHEDULE_ID,
    userId: ADMIN,
    nvrId: NVR_ID,
    name: "Office hours",
    enabled: true,
    schedule: officeHours,
    cameras: [{ channelId: CAM_CONFIGURED, enabled: true }],
    detectors: [],
    markModified: vi.fn(),
    save: vi.fn(async function () {
      return this;
    }),
  });

  it("updates only the supplied fields", async () => {
    const doc = existingDoc();
    h.gsFindOne = vi.fn(async () => doc);

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({ params: { id: SCHEDULE_ID }, body: { enabled: false } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(doc.enabled).toBe(false);
    expect(doc.name).toBe("Office hours");
    expect(doc.save).toHaveBeenCalled();
  });

  it("un-enrols a camera without deleting its row", async () => {
    const doc = existingDoc();
    h.gsFindOne = vi.fn(async () => doc);
    h.channelFind = vi.fn(() => chain([configuredChannel(CAM_CONFIGURED, "Camera 01")]));

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({
        params: { id: SCHEDULE_ID },
        body: { cameras: [{ channelId: CAM_CONFIGURED, enabled: false }] },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(doc.cameras).toEqual([{ channelId: CAM_CONFIGURED, enabled: false }]);
  });

  it("strips nvrId so a read-modify-write PUT cannot move the schedule to another NVR", async () => {
    const doc = existingDoc();
    h.gsFindOne = vi.fn(async () => doc);

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({
        params: { id: SCHEDULE_ID },
        body: { enabled: false, nvrId: "650000000000000000000a99" },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(doc.nvrId).toBe(NVR_ID);
  });

  it("rejects an empty update body", async () => {
    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({ params: { id: SCHEDULE_ID }, body: {} }),
      res,
    );

    expect(res.statusCode).toBe(400);
  });

  it("still enforces the configured-camera rule on update", async () => {
    const doc = existingDoc();
    h.gsFindOne = vi.fn(async () => doc);
    h.channelFind = vi.fn(() => chain([bareChannel(CAM_BARE, "Camera 05")]));

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({
        params: { id: SCHEDULE_ID },
        body: { cameras: [{ channelId: CAM_BARE, enabled: true }] },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("404s for another admin's schedule", async () => {
    h.gsFindOne = vi.fn(async () => null);

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({
        params: { id: SCHEDULE_ID },
        body: { enabled: false },
        verified: { userData: { user_id: OTHER_ADMIN } },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(h.gsFindOne).toHaveBeenCalledWith({ _id: SCHEDULE_ID, userId: OTHER_ADMIN });
  });
});

describe("read and delete", () => {
  it("lists schedules for the admin, filtered by nvrId when given", async () => {
    h.gsFind = vi.fn(() => chain([{ _id: SCHEDULE_ID }]));

    const res = makeRes();
    await service.getAllGlobalSchedules(makeReq({ query: { nvrId: NVR_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(payload(res).count).toBe(1);
    expect(h.gsFind).toHaveBeenCalledWith({ userId: ADMIN, nvrId: NVR_ID });
  });

  it("omits the nvr filter when no nvrId is supplied", async () => {
    const res = makeRes();
    await service.getAllGlobalSchedules(makeReq(), res);

    expect(h.gsFind).toHaveBeenCalledWith({ userId: ADMIN });
  });

  it("404s reading a schedule that is not the admin's", async () => {
    h.gsFindOne = vi.fn(() => chain(null));

    const res = makeRes();
    await service.getGlobalSchedule(makeReq({ params: { id: SCHEDULE_ID } }), res);

    expect(res.statusCode).toBe(404);
  });

  it("deletes scoped by owner", async () => {
    h.gsFindOneAndDelete = vi.fn(async () => ({ _id: SCHEDULE_ID, nvrId: NVR_ID }));

    const res = makeRes();
    await service.deleteGlobalSchedule(makeReq({ params: { id: SCHEDULE_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(h.gsFindOneAndDelete).toHaveBeenCalledWith({ _id: SCHEDULE_ID, userId: ADMIN });
  });

  it("404s deleting someone else's schedule", async () => {
    const res = makeRes();
    await service.deleteGlobalSchedule(makeReq({ params: { id: SCHEDULE_ID } }), res);

    expect(res.statusCode).toBe(404);
  });
});

describe("separation of concerns", () => {
  it("never imports or calls the DS/python service", async () => {
    // The scheduler decides what happens and when; this service only persists
    // configuration. If someone wires a DS call in here, this fails.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("core/v2/globalSchedule/globalSchedule.service.js", "utf8"),
    );

    expect(source).not.toMatch(/python\.service/);
    expect(source).not.toMatch(/stop-all|resume-all/);
    expect(source).not.toMatch(/handleDetectionStartStop/);
  });
});

describe("controller wiring", () => {
  /**
   * `admin.routes` fails in this repo with "Route.get() requires a callback
   * function but got undefined" — a route referencing a controller method that
   * does not exist. These assertions catch that class of bug for this module:
   * the contract test mounts the real routes against a MOCKED controller, so
   * only this checks the real controller actually has the handlers.
   */
  const handlers = [
    "getNvrCameras",
    "getAllGlobalSchedules",
    "createGlobalSchedule",
    "getGlobalSchedule",
    "updateGlobalSchedule",
    "deleteGlobalSchedule",
  ];

  it("exposes every handler the routes file references", async () => {
    const { default: controller } = await import(
      "../../../core/v2/globalSchedule/globalSchedule.controller.js"
    );

    for (const name of handlers) {
      expect(controller[name], `controller.${name} is missing`).toBeTypeOf("function");
    }
  });

  it("delegates to the service", async () => {
    const { default: controller } = await import(
      "../../../core/v2/globalSchedule/globalSchedule.controller.js"
    );
    const spy = vi.spyOn(service, "getAllGlobalSchedules").mockResolvedValue("delegated");

    await expect(controller.getAllGlobalSchedules(makeReq(), makeRes())).resolves.toBe("delegated");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("UI payload contract", () => {
  /**
   * The Settings UI (client_v2 GlobalDetectionScheduling.jsx) has no test
   * runner of its own, so the exact request bodies it builds are pinned here.
   * If someone tightens validation in a way that would break the UI, this
   * fails on the server side rather than in a browser.
   */
  const uiDays = (ranges) =>
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].reduce(
      (acc, day) => ({ ...acc, [day]: ranges[day] || [] }),
      {},
    );

  beforeEach(() => {
    h.channelFind = vi.fn(() =>
      chain([configuredChannel(CAM_CONFIGURED, "Camera 01"), bareChannel(CAM_BARE, "Camera 05")]),
    );
  });

  it("accepts the create payload: all seven days present, some empty", async () => {
    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({
        body: {
          nvrId: NVR_ID,
          name: "NVR-01 global schedule",
          schedule: {
            mode: "custom",
            timezone: "Asia/Kolkata",
            days: uiDays({
              monday: [{ start: "09:00", end: "18:00" }],
              tuesday: [{ start: "09:00", end: "18:00" }],
            }),
          },
          cameras: [{ channelId: CAM_CONFIGURED, enabled: true }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
  });

  it("accepts the always-mode create payload (schedule is just {mode})", async () => {
    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({
        body: {
          nvrId: NVR_ID,
          name: "NVR-01 global schedule",
          schedule: { mode: "always" },
          cameras: [{ channelId: CAM_CONFIGURED, enabled: true }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
  });

  it("accepts the update payload: enrolled cameras plus un-enrolled rows", async () => {
    const doc = {
      _id: SCHEDULE_ID,
      userId: ADMIN,
      nvrId: NVR_ID,
      cameras: [{ channelId: CAM_CONFIGURED, enabled: true }],
      markModified: vi.fn(),
      save: vi.fn(async function () {
        return this;
      }),
    };
    h.gsFindOne = vi.fn(async () => doc);

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({
        params: { id: SCHEDULE_ID },
        body: {
          schedule: {
            mode: "custom",
            timezone: "Asia/Kolkata",
            days: uiDays({ monday: [{ start: "09:00", end: "18:00" }] }),
          },
          // The UI keeps a de-selected camera as an enabled:false row rather
          // than dropping it, so un-enrolling stays explicit and reversible.
          cameras: [
            { channelId: CAM_CONFIGURED, enabled: true },
            { channelId: CAM_BARE, enabled: false },
          ],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(doc.cameras).toEqual([
      { channelId: CAM_CONFIGURED, enabled: true },
      { channelId: CAM_BARE, enabled: false },
    ]);
  });

  it("accepts a full read-modify-write PUT of a fetched schedule", async () => {
    // The UI may PUT back an object it just GET'd; server-managed fields must
    // be stripped rather than rejected.
    const doc = {
      _id: SCHEDULE_ID,
      userId: ADMIN,
      nvrId: NVR_ID,
      cameras: [],
      markModified: vi.fn(),
      save: vi.fn(async function () {
        return this;
      }),
    };
    h.gsFindOne = vi.fn(async () => doc);

    const res = makeRes();
    await service.updateGlobalSchedule(
      makeReq({
        params: { id: SCHEDULE_ID },
        body: {
          _id: SCHEDULE_ID,
          userId: ADMIN,
          nvrId: NVR_ID,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          __v: 0,
          enabled: true,
          schedule: { mode: "always" },
          cameras: [{ channelId: CAM_CONFIGURED, enabled: true }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(doc.nvrId).toBe(NVR_ID);
  });
});

describe("applied vs merely-linked detectors", () => {
  /**
   * Creating/editing a detection setting links it to every selected channel
   * with enabled:false, so cameras accumulate links for detectors they were
   * never set up for. Listing those made a single camera show ~19 detectors.
   * A detector counts only when it is enabled on this camera, or has zones
   * drawn for THIS camera.
   */
  const OTHER_DETECTOR = "lineCrossingSettings";

  it("lists only the applied detector, not every linked one", async () => {
    const channel = configuredChannel(CAM_CONFIGURED, "Main Entrance");
    // Two extra detectors linked but never configured for this camera.
    channel.detections[OTHER_DETECTOR] = {
      id: { _id: "ds-shared", settings: { referencePoints: { someOtherCamera: [{ x: 1 }] } } },
      enabled: false,
    };
    channel.detections.crowdDetectionSettings = {
      id: { _id: "ds-shared-2", settings: {} },
      enabled: false,
    };
    h.channelFind = vi.fn(() => chain([channel]));

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    const detectors = payload(res).configuredCameras[0].configuredDetectors;
    expect(detectors.map((d) => d.settingType)).toEqual([DETECTOR]);
  });

  it("keeps a zoned-but-stopped detector — configured cameras must not vanish when off", async () => {
    h.channelFind = vi.fn(() => chain([zonedChannel(CAM_CONFIGURED, "Camera 01")]));

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    const camera = payload(res).configuredCameras[0];
    expect(camera.configuredDetectors.map((d) => d.settingType)).toEqual([DETECTOR]);
    expect(camera.configuredDetectors[0].enabled).toBe(false);
  });

  it("treats a link with zones for a DIFFERENT camera as non-configured", async () => {
    // The detection setting is shared across cameras, so its referencePoints
    // map holds other cameras' zones. Those must not count for this one.
    h.channelFind = vi.fn(() =>
      chain([linkedOnlyChannel(CAM_BARE, "Camera 05", [OTHER_DETECTOR])]),
    );

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    expect(payload(res).configuredCameras).toEqual([]);
    expect(payload(res).nonConfiguredCameras.map((c) => c.name)).toEqual(["Camera 05"]);
  });

  it("treats an empty zone array for this camera as non-configured", async () => {
    const channel = linkedOnlyChannel(CAM_BARE, "Camera 05");
    channel.detections[DETECTOR].id.settings.referencePoints = { [CAM_BARE]: [] };
    h.channelFind = vi.fn(() => chain([channel]));

    const res = makeRes();
    await service.getNvrCameras(makeReq({ params: { nvrId: NVR_ID } }), res);

    expect(payload(res).configuredCameras).toEqual([]);
  });

  it("blocks enrolling a camera whose detectors are only linked, never applied", async () => {
    h.channelFind = vi.fn(() => chain([linkedOnlyChannel(CAM_BARE, "Camera 05")]));

    const res = makeRes();
    await service.createGlobalSchedule(
      makeReq({
        body: {
          nvrId: NVR_ID,
          schedule: { mode: "always" },
          cameras: [{ channelId: CAM_BARE, enabled: true }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/configured for detection/i);
  });
});
