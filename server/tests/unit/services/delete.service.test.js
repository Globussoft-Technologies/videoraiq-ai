/**
 * DeleteService.deleteNVR — cascade completeness.
 *
 * The bug this pins: Channel has a pre(/^find/) hook that injects
 * { isAdded: true } unless the query opts out with includeInactive. The delete
 * path did not opt out, so cameras discovered from an NVR but never added
 * survived the NVR itself as orphans.
 *
 * Mocks: the models and side-effect helpers, so this asserts the cascade's
 * shape (what is queried, in what order) rather than hitting a DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  channels: [],
  // Records the options every Channel.find/findById ran with.
  findOptions: [],
  deletedChannelIds: [],
  deletedNvrIds: [],
  // Call order across models, to catch "cleanup reads a row it already deleted".
  order: [],
  pulledChannelIds: null,
}));

// Stands in for the real ChannelSchema.pre(/^find/) hook: unless the query
// opts out with includeInactive, un-added channels are invisible. Without this
// the mock would be more forgiving than production and the bug would pass.
const applyIsAddedHook = (rows, opts) =>
  opts.includeInactive ? rows : rows.filter((c) => c.isAdded === true);

const chainable = (rows, tag, pick = (r) => r) => {
  const q = {
    _opts: {},
    setOptions(o) {
      this._opts = { ...this._opts, ...o };
      return this;
    },
    select() {
      return this;
    },
    then(resolve, reject) {
      h.findOptions.push({ tag, opts: this._opts });
      const visible = applyIsAddedHook(rows, this._opts);
      return Promise.resolve(pick(visible)).then(resolve, reject);
    },
  };
  return q;
};

vi.mock("../../../core/v1/channels/channels.model.js", () => ({
  default: {
    find: vi.fn(() => chainable(h.channels, "find")),
    findById: vi.fn((id) =>
      chainable(h.channels, "findById", (visible) =>
        visible.find((c) => String(c._id) === String(id)) || null,
      ),
    ),
    deleteOne: vi.fn(async ({ _id }) => {
      h.deletedChannelIds.push(String(_id));
      return { deletedCount: 1 };
    }),
  },
}));

vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: {
    deleteOne: vi.fn(async ({ _id }) => {
      h.order.push("nvr.deleteOne");
      h.deletedNvrIds.push(String(_id));
      return { deletedCount: 1 };
    }),
    distinct: vi.fn(async () => {
      h.order.push("nvr.distinct");
      return ["Bangalore"];
    }),
  },
}));

vi.mock("../../../core/v1/cameraRestrictions/authorizedChannels.model.js", () => ({
  default: {
    find: vi.fn(async () => []),
    updateMany: vi.fn(async (filter) => {
      if (filter.channels) h.pulledChannelIds = filter.channels.$in.map(String);
      return { modifiedCount: 0 };
    }),
  },
}));

vi.mock("../../../core/v1/incidents/incidents.model.js", () => ({
  Incident: { deleteMany: vi.fn(async () => ({ deletedCount: 0 })) },
}));
vi.mock("../../../core/v1/detectionSettings/detectionSettings.model.js", () => ({
  DetectionSetting: { deleteMany: vi.fn(async () => ({ deletedCount: 0 })) },
}));
vi.mock("../../../core/v1/users/users.model.js", () => ({ default: {} }));
vi.mock("../../../utils/database.js", () => ({ redis: { del: vi.fn(async () => 1) } }));
vi.mock("../../../utils/rtspStream.js", () => ({
  resolveStream: vi.fn(async () => ({ host: "http://stream", token: "t" })),
}));
vi.mock("axios", () => ({ default: { delete: vi.fn(async () => ({})) } }));

const { default: DeleteService } = await import("../../../services/delete.service.js");
const { default: authorizedChannelsModel } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);

beforeEach(() => {
  h.channels = [];
  h.findOptions = [];
  h.deletedChannelIds = [];
  h.deletedNvrIds = [];
  h.order = [];
  h.pulledChannelIds = null;
  vi.clearAllMocks();
});

describe("DeleteService.deleteNVR", () => {
  it("deletes un-added cameras too, not just the added ones", async () => {
    h.channels = [
      { _id: "cam-added", userId: "u1", isAdded: true },
      { _id: "cam-never-added", userId: "u1", isAdded: false },
    ];

    await DeleteService.deleteNVR("nvr-1");

    expect(h.deletedChannelIds.sort()).toEqual(["cam-added", "cam-never-added"]);
    expect(h.deletedNvrIds).toEqual(["nvr-1"]);
  });

  it("opts out of the isAdded pre-hook on every channel query in the cascade", async () => {
    h.channels = [{ _id: "cam-never-added", userId: "u1", isAdded: false }];

    await DeleteService.deleteNVR("nvr-1");

    // Both the listing find and deleteChannel's findById must bypass the hook,
    // or an un-added camera reads as "not found" and aborts the delete.
    expect(h.findOptions.length).toBeGreaterThanOrEqual(2);
    for (const { tag, opts } of h.findOptions) {
      expect(opts.includeInactive, `${tag} must set includeInactive`).toBe(true);
    }
  });

  it("strips the deleted channels from users' authorized lists", async () => {
    h.channels = [
      { _id: "cam-a", userId: "u1", isAdded: true },
      { _id: "cam-b", userId: "u1", isAdded: false },
    ];

    await DeleteService.deleteNVR("nvr-1");

    // Regression: these ids used to be collected after the channels were
    // deleted, so the $pull always ran against an empty list.
    expect(h.pulledChannelIds?.sort()).toEqual(["cam-a", "cam-b"]);
  });

  it("reads the NVR's location before deleting the NVR row", async () => {
    h.channels = [];

    await DeleteService.deleteNVR("nvr-1");

    // Regression: distinct() ran after deleteOne(), so it never found a
    // location and users kept it in their authorized list forever.
    expect(h.order).toEqual(["nvr.distinct", "nvr.deleteOne"]);
    expect(authorizedChannelsModel.updateMany).toHaveBeenCalledWith(
      { locations: { $in: ["Bangalore"] } },
      { $pull: { locations: { $in: ["Bangalore"] } } },
    );
  });

  it("accepts a document as well as a raw id", async () => {
    h.channels = [];

    await DeleteService.deleteNVR({ _id: "nvr-9" });

    expect(h.deletedNvrIds).toEqual(["nvr-9"]);
  });
});
