/**
 * Unit coverage for utils/vehicleTagging.js — the plate → registered-user
 * resolution behind the Tag User flow on ANPR Logs and Vehicle Detection
 * incidents.
 *
 * The authorizedUsers model is mocked so these tests exercise only the
 * normalisation, regex matching and attachment logic, with no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMock = vi.fn();

vi.mock("../../../core/v1/authorizedUsers/authorizedUsers.model.js", () => ({
  default: { find: (...args) => findMock(...args) },
}));

const {
  normalizePlate,
  findVehicleOwners,
  findTaggedPlates,
  attachTaggedUsers,
  vehicleTagStages,
  stripNormPlateStage,
  escapeRegex,
  NORM_PLATE_FIELD,
} = await import("../../../utils/vehicleTagging.js");

const ADMIN_ID = "664f1a2b3c4d5e6f7a8b9c0d";

/** Stand-in for the chained `.find().sort().lean()` the util calls. */
function mockUsers(users) {
  findMock.mockReturnValue({
    sort: () => ({ lean: async () => users }),
    lean: async () => users,
  });
}

beforeEach(() => {
  findMock.mockReset();
});

describe("normalizePlate", () => {
  it("uppercases and strips every separator", () => {
    expect(normalizePlate("ka-02 mp 9657")).toBe("KA02MP9657");
    expect(normalizePlate("KA02MP9657")).toBe("KA02MP9657");
    expect(normalizePlate(" ka02/mp.9657 ")).toBe("KA02MP9657");
  });

  it("returns an empty string for values with nothing to match on", () => {
    expect(normalizePlate(null)).toBe("");
    expect(normalizePlate(undefined)).toBe("");
    expect(normalizePlate("--")).toBe("");
    expect(normalizePlate("   ")).toBe("");
  });
});

describe("findVehicleOwners", () => {
  it("keys owners by their normalised plate", async () => {
    mockUsers([{ _id: "u1", firstName: "Asha", vehicleNumber: "KA 02 MP 9657" }]);

    const owners = await findVehicleOwners(["ka02mp9657"], ADMIN_ID);

    expect(owners.get("KA02MP9657")).toMatchObject({ _id: "u1", firstName: "Asha" });
  });

  it("scopes the query to the admin and matches separators loosely", async () => {
    mockUsers([]);

    await findVehicleOwners(["KA02MP9657"], ADMIN_ID);

    const [filter] = findMock.mock.calls[0];
    expect(filter.adminId).toBe(ADMIN_ID);
    const [regex] = filter.vehicleNumber.$in;
    // The same plate however it happens to be stored.
    expect(regex.test("KA02MP9657")).toBe(true);
    expect(regex.test("KA 02 MP 9657")).toBe(true);
    expect(regex.test("ka-02-mp-9657")).toBe(true);
    // ...but never a different or partial one.
    expect(regex.test("KA02MP9658")).toBe(false);
    expect(regex.test("KA02MP965")).toBe(false);
    expect(regex.test("XKA02MP9657")).toBe(false);
  });

  it("de-duplicates plates that differ only in formatting", async () => {
    mockUsers([]);

    await findVehicleOwners(["KA02MP9657", "ka02 mp 9657", "  "], ADMIN_ID);

    expect(findMock.mock.calls[0][0].vehicleNumber.$in).toHaveLength(1);
  });

  it("keeps the first owner when two users share a plate", async () => {
    // The util sorts oldest-first, so the first row wins and the name shown
    // for a plate stays stable between requests.
    mockUsers([
      { _id: "older", vehicleNumber: "KA02MP9657" },
      { _id: "newer", vehicleNumber: "ka02 mp 9657" },
    ]);

    const owners = await findVehicleOwners(["KA02MP9657"], ADMIN_ID);

    expect(owners.get("KA02MP9657")._id).toBe("older");
  });

  it("reads every tagged user instead of a huge regex $in past 200 plates", async () => {
    // The export path asks for thousands of plates at once; a regex $in that
    // wide costs more than scanning the admin's tagged users in memory.
    mockUsers([
      { _id: "u1", vehicleNumber: "KA02MP9657" },
      { _id: "u2", vehicleNumber: "KA99ZZ0000" }, // tagged, but not asked about
    ]);
    const many = Array.from({ length: 250 }, (_, i) => `KA02MP${1000 + i}`);

    const owners = await findVehicleOwners(["KA02MP9657", ...many], ADMIN_ID);

    expect(findMock.mock.calls[0][0].vehicleNumber).toEqual({ $nin: [null, ""] });
    expect(owners.get("KA02MP9657")._id).toBe("u1");
    // Plates the caller never asked about must not leak into the result.
    expect(owners.has("KA99ZZ0000")).toBe(false);
  });

  it("never queries without an admin or a usable plate", async () => {
    expect((await findVehicleOwners(["KA02MP9657"], null)).size).toBe(0);
    expect((await findVehicleOwners([], ADMIN_ID)).size).toBe(0);
    expect((await findVehicleOwners(["--", null], ADMIN_ID)).size).toBe(0);
    expect(findMock).not.toHaveBeenCalled();
  });
});

describe("attachTaggedUsers", () => {
  it("attaches the owner to matching docs and null to unclaimed plates", async () => {
    mockUsers([{ _id: "u1", firstName: "Asha", vehicleNumber: "KA02MP9657" }]);

    const docs = [
      { _id: "i1", vehicleNumber: "ka02 mp 9657" },
      { _id: "i2", vehicleNumber: "KA05XY1111" },
    ];
    await attachTaggedUsers(docs, ADMIN_ID);

    expect(docs[0].taggedUser).toMatchObject({ _id: "u1" });
    expect(docs[1].taggedUser).toBeNull();
  });

  it("leaves docs without a readable plate untouched", async () => {
    // No plate means nothing to tag a user to, so the UI must not be handed a
    // `taggedUser` key that would make it offer the action.
    const docs = [{ _id: "i1" }, { _id: "i2", vehicleNumber: null }, { _id: "i3", vehicleNumber: "--" }];

    await attachTaggedUsers(docs, ADMIN_ID);

    for (const doc of docs) expect(doc).not.toHaveProperty("taggedUser");
    expect(findMock).not.toHaveBeenCalled();
  });

  it("handles a single doc and an empty list", async () => {
    mockUsers([{ _id: "u1", vehicleNumber: "KA02MP9657" }]);

    const doc = { _id: "i1", vehicleNumber: "KA02MP9657" };
    await attachTaggedUsers(doc, ADMIN_ID);
    expect(doc.taggedUser).toMatchObject({ _id: "u1" });

    await expect(attachTaggedUsers([], ADMIN_ID)).resolves.toEqual([]);
    await expect(attachTaggedUsers(null, ADMIN_ID)).resolves.toBeNull();
  });

  it("resolves every doc from a single query", async () => {
    mockUsers([{ _id: "u1", vehicleNumber: "KA02MP9657" }]);

    await attachTaggedUsers(
      [
        { vehicleNumber: "KA02MP9657" },
        { vehicleNumber: "ka02mp9657" },
        { vehicleNumber: "KA05XY1111" },
      ],
      ADMIN_ID,
    );

    expect(findMock).toHaveBeenCalledTimes(1);
  });
});

describe("findTaggedPlates", () => {
  it("returns every tagged plate, normalised and de-duplicated", async () => {
    mockUsers([
      { vehicleNumber: "KA 02 MP 9657" },
      { vehicleNumber: "ka02mp9657" },
      { vehicleNumber: "KA05XY1111" },
      { vehicleNumber: "" },
    ]);

    const plates = await findTaggedPlates(ADMIN_ID);

    expect(plates).toEqual(["KA02MP9657", "KA05XY1111"]);
    expect(findMock.mock.calls[0][0]).toMatchObject({ adminId: ADMIN_ID });
  });

  it("narrows to the users a name search matches", async () => {
    mockUsers([{ vehicleNumber: "KA02MP9657" }]);

    await findTaggedPlates(ADMIN_ID, { search: "Asha" });

    const [filter] = findMock.mock.calls[0];
    const fields = filter.$or.map((clause) => Object.keys(clause)[0]);
    expect(fields).toEqual(["userName", "firstName", "lastName", "email"]);
    expect(filter.$or[0].userName.test("asha rao")).toBe(true);
    expect(filter.$or[0].userName.test("vikram")).toBe(false);
  });

  it("treats a blank search as no search at all", async () => {
    mockUsers([]);

    await findTaggedPlates(ADMIN_ID, { search: "   " });

    expect(findMock.mock.calls[0][0].$or).toBeUndefined();
  });

  it("never queries without an admin", async () => {
    expect(await findTaggedPlates(null)).toEqual([]);
    expect(findMock).not.toHaveBeenCalled();
  });
});

describe("vehicleTagStages", () => {
  const plates = ["KA02MP9657"];

  it("only exposes the helper field for 'all' or an unset filter", () => {
    for (const status of [undefined, "", "all", "nonsense"]) {
      const stages = vehicleTagStages(status, plates);
      expect(stages).toHaveLength(1);
      expect(stages[0].$addFields).toHaveProperty(NORM_PLATE_FIELD);
    }
  });

  it("narrows to tagged plates with $in and untagged with $nin", () => {
    expect(vehicleTagStages("tagged", plates)[1]).toEqual({
      $match: { [NORM_PLATE_FIELD]: { $in: plates } },
    });
    expect(vehicleTagStages("untagged", plates)[1]).toEqual({
      $match: { [NORM_PLATE_FIELD]: { $nin: plates } },
    });
  });

  it("strips the helper field so the response shape is unchanged", () => {
    expect(stripNormPlateStage).toEqual({ $project: { [NORM_PLATE_FIELD]: 0 } });
  });
});

describe("escapeRegex", () => {
  it("neutralises the characters a typed search could smuggle in", () => {
    expect(new RegExp(escapeRegex("a.b*c")).test("a.b*c")).toBe(true);
    expect(new RegExp(escapeRegex("a.b*c")).test("axbbc")).toBe(false);
    // An unescaped "(" would throw on construction rather than just mismatch.
    expect(() => new RegExp(escapeRegex("("))).not.toThrow();
  });
});
