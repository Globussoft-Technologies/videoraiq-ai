/**
 * Integration tests for previously-uncovered Mongoose models:
 *   - Entry + EntryUser (event-with-image validator branches)
 *   - Vehicle + VehicleLog (unique plate, event-with-image validator)
 *   - files (Admin-scoped file record)
 *
 * These are pure schema-level tests using mongodb-memory-server.
 * No external service mocks (mock budget 0/8).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../dbSetup.js";

const { default: Entry } = await import(
  "../../../core/v1/entry/entry.model.js"
);
const { default: EntryUser } = await import(
  "../../../core/v1/entry/user.model.js"
);
const { default: Vehicle } = await import(
  "../../../core/v1/vehicle/vehicle.model.js"
);
const { default: VehicleLog } = await import(
  "../../../core/v1/vehicle/vehicle.log.model.js"
);
const { default: Files } = await import(
  "../../../core/v1/files/files.model.js"
);

beforeAll(async () => {
  await connectMongo();
  // Vehicle has a unique index on vehicleNumber — make sure it's built
  // before the first insert so the duplicate-key test sees it.
  await Vehicle.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

// ---------------------------------------------------------------------------
// EntryUser model — simple bag of strings, timestamps applied.
// ---------------------------------------------------------------------------

describe("EntryUser model", () => {
  it("creates with no required fields (all optional)", async () => {
    const u = await EntryUser.create({});
    expect(u._id).toBeDefined();
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.updatedAt).toBeInstanceOf(Date);
    expect(u.profileImages).toEqual([]);
  });

  it("stores firstName/lastName/email and a profileImages array", async () => {
    const u = await EntryUser.create({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      profileImages: ["a.png", "b.png"],
    });
    expect(u.firstName).toBe("Ada");
    expect(u.lastName).toBe("Lovelace");
    expect(u.email).toBe("ada@example.com");
    expect(u.profileImages).toEqual(["a.png", "b.png"]);
  });
});

// ---------------------------------------------------------------------------
// Entry model — requires adminId + userId; events array uses ImagesSchema
// with a custom validator (at least one of face / person / frame must be set).
// ---------------------------------------------------------------------------

describe("Entry model", () => {
  const adminId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  it("requires both adminId and userId", async () => {
    await expect(Entry.create({ adminId })).rejects.toThrow();
    await expect(Entry.create({ userId })).rejects.toThrow();
  });

  it("creates with empty events array by default", async () => {
    const e = await Entry.create({ adminId, userId });
    expect(e.events).toEqual([]);
    expect(e.createdAt).toBeInstanceOf(Date);
  });

  it("accepts an event whose images has at least a face", async () => {
    const e = await Entry.create({
      adminId,
      userId,
      events: [
        {
          nvr: new mongoose.Types.ObjectId(),
          channel: new mongoose.Types.ObjectId(),
          images: { face: "face.jpg" },
        },
      ],
    });
    expect(e.events).toHaveLength(1);
    expect(e.events[0].images.face).toBe("face.jpg");
    expect(e.events[0].timestamp).toBeInstanceOf(Date); // default Date.now
  });

  it("accepts an event whose images only has 'person' or only 'frame'", async () => {
    const e = await Entry.create({
      adminId,
      userId,
      events: [
        { images: { person: "p.jpg" } },
        { images: { frame: "f.jpg" } },
      ],
    });
    expect(e.events).toHaveLength(2);
  });

  it("rejects an event whose images has empty face/person/frame strings", async () => {
    // The validator is `v && (v.face || v.person || v.frame)`. Empty strings
    // are falsy, so all-empty triggers the failure path. (Note: an *omitted*
    // `images` sub-doc is normalized away by Mongoose and never reaches the
    // validator — pinning the validator-fires path is the meaningful branch.)
    await expect(
      Entry.create({
        adminId,
        userId,
        events: [{ images: { face: "", person: "", frame: "" } }],
      }),
    ).rejects.toThrow(/At least one image/);
  });
});

// ---------------------------------------------------------------------------
// Vehicle model — vehicleNumber is unique + required.
// ---------------------------------------------------------------------------

describe("Vehicle model", () => {
  it("requires vehicleNumber", async () => {
    await expect(Vehicle.create({})).rejects.toThrow();
  });

  it("creates a vehicle and applies timestamps", async () => {
    const v = await Vehicle.create({ vehicleNumber: "KA01AB1234" });
    expect(v.vehicleNumber).toBe("KA01AB1234");
    expect(v.createdAt).toBeInstanceOf(Date);
    expect(v.updatedAt).toBeInstanceOf(Date);
  });

  it("enforces unique vehicleNumber across documents", async () => {
    await Vehicle.create({ vehicleNumber: "DUP-1" });
    await expect(Vehicle.create({ vehicleNumber: "DUP-1" })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// VehicleLog model — requires adminId + vehicleId; events use a sub-schema
// whose images validator requires `images.vehicle` to be set.
// ---------------------------------------------------------------------------

describe("VehicleLog model", () => {
  const adminId = new mongoose.Types.ObjectId();
  const vehicleId = new mongoose.Types.ObjectId();

  it("requires adminId and vehicleId", async () => {
    await expect(VehicleLog.create({ adminId })).rejects.toThrow();
    await expect(VehicleLog.create({ vehicleId })).rejects.toThrow();
  });

  it("creates with empty events array by default", async () => {
    const log = await VehicleLog.create({ adminId, vehicleId });
    expect(log.events).toEqual([]);
  });

  it("accepts an event with images.vehicle set", async () => {
    const log = await VehicleLog.create({
      adminId,
      vehicleId,
      events: [
        {
          nvr: new mongoose.Types.ObjectId(),
          channel: new mongoose.Types.ObjectId(),
          images: { vehicle: "veh.jpg" },
        },
      ],
    });
    expect(log.events).toHaveLength(1);
    expect(log.events[0].images.vehicle).toBe("veh.jpg");
  });

  it("rejects an event whose images.vehicle is an empty string", async () => {
    // Validator is `v && v.vehicle`. An omitted `images` sub-doc is normalized
    // away by Mongoose; passing `{ vehicle: "" }` keeps the sub-doc and exercises
    // the failure branch.
    await expect(
      VehicleLog.create({
        adminId,
        vehicleId,
        events: [{ images: { vehicle: "" } }],
      }),
    ).rejects.toThrow(/Vehicle image is required/);
  });
});

// ---------------------------------------------------------------------------
// files model — userId + fileId are required; storageId is optional.
// ---------------------------------------------------------------------------

describe("files model", () => {
  const userId = new mongoose.Types.ObjectId();

  it("requires userId and fileId", async () => {
    await expect(Files.create({ userId })).rejects.toThrow();
    await expect(Files.create({ fileId: "abc" })).rejects.toThrow();
  });

  it("creates without storageId (optional ref)", async () => {
    const f = await Files.create({ userId, fileId: "abc-123" });
    expect(f.userId.toString()).toBe(userId.toString());
    expect(f.fileId).toBe("abc-123");
    expect(f.storageId).toBeUndefined();
    expect(f.createdAt).toBeInstanceOf(Date);
  });

  it("stores storageId when provided", async () => {
    const storageId = new mongoose.Types.ObjectId();
    const f = await Files.create({ userId, fileId: "x", storageId });
    expect(f.storageId.toString()).toBe(storageId.toString());
  });
});
