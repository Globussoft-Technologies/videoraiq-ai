/**
 * Integration tests for core/v1/accesslogs/reworkedAccesslogs.model.js
 * (registered as "TestAccessLogs"). It is a nested per-user-per-day schema
 * with required admin + each event needing nvr/channel/personName + a
 * required faceImage on the embedded images sub-doc.
 *
 * Pure schema test — no service mocks (mock budget 0/8).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectMongo,
  disconnectMongo,
  clearCollections,
} from "../dbSetup.js";

const { default: ReworkedAccessLogs } = await import(
  "../../../core/v1/accesslogs/reworkedAccesslogs.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("ReworkedAccessLogs (TestAccessLogs) model", () => {
  const admin = new mongoose.Types.ObjectId();

  it("requires admin", async () => {
    await expect(ReworkedAccessLogs.create({})).rejects.toThrow();
  });

  it("creates with defaults — empty usersLogs and a default date", async () => {
    const log = await ReworkedAccessLogs.create({ admin });
    expect(log.usersLogs).toEqual([]);
    expect(log.date).toBeInstanceOf(Date);
    expect(log.createdAt).toBeInstanceOf(Date);
    expect(log.updatedAt).toBeInstanceOf(Date);
  });

  it("creates a userSession entry with default lastCreatedAt and null userId", async () => {
    const log = await ReworkedAccessLogs.create({
      admin,
      usersLogs: [{}],
    });
    expect(log.usersLogs).toHaveLength(1);
    expect(log.usersLogs[0].userId).toBeNull();
    expect(log.usersLogs[0].lastCreatedAt).toBeInstanceOf(Date);
    expect(log.usersLogs[0].sessions).toEqual([]);
  });

  it("requires nvr, channel, and personName on each session", async () => {
    const okImages = { faceImage: "f.jpg" };
    // Missing nvr
    await expect(
      ReworkedAccessLogs.create({
        admin,
        usersLogs: [
          {
            sessions: [
              {
                channel: new mongoose.Types.ObjectId(),
                personName: "Alice",
                images: okImages,
              },
            ],
          },
        ],
      })
    ).rejects.toThrow();

    // Missing channel
    await expect(
      ReworkedAccessLogs.create({
        admin,
        usersLogs: [
          {
            sessions: [
              {
                nvr: new mongoose.Types.ObjectId(),
                personName: "Alice",
                images: okImages,
              },
            ],
          },
        ],
      })
    ).rejects.toThrow();

    // Missing personName
    await expect(
      ReworkedAccessLogs.create({
        admin,
        usersLogs: [
          {
            sessions: [
              {
                nvr: new mongoose.Types.ObjectId(),
                channel: new mongoose.Types.ObjectId(),
                images: okImages,
              },
            ],
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("rejects an images sub-doc whose faceImage is empty (required:true)", async () => {
    // The sub-schema declares `faceImage: { default: "", required: true }`.
    // The default "" is applied before validation, but mongoose treats an
    // empty string as missing for `required: true`, so an images sub-doc
    // without an explicit faceImage value is rejected.
    await expect(
      ReworkedAccessLogs.create({
        admin,
        usersLogs: [
          {
            sessions: [
              {
                nvr: new mongoose.Types.ObjectId(),
                channel: new mongoose.Types.ObjectId(),
                personName: "Alice",
                images: { personImage: "p.jpg" }, // faceImage missing -> default "" -> rejected
              },
            ],
          },
        ],
      })
    ).rejects.toThrow(/faceImage/);
  });

  it("stores a complete user session group with multiple events", async () => {
    const userId = new mongoose.Types.ObjectId();
    const nvr = new mongoose.Types.ObjectId();
    const channel = new mongoose.Types.ObjectId();
    const log = await ReworkedAccessLogs.create({
      admin,
      usersLogs: [
        {
          userId,
          sessions: [
            {
              nvr,
              channel,
              personName: "Alice",
              images: {
                faceImage: "face1.jpg",
                personImage: "p1.jpg",
                frameImage: "f1.jpg",
              },
            },
            {
              nvr,
              channel,
              personName: "Alice",
              // explicit faceImage required; personImage/frameImage default ""
              images: { faceImage: "f2.jpg" },
            },
          ],
        },
      ],
    });
    expect(log.usersLogs[0].userId.toString()).toBe(userId.toString());
    expect(log.usersLogs[0].sessions).toHaveLength(2);
    expect(log.usersLogs[0].sessions[0].images.faceImage).toBe("face1.jpg");
    expect(log.usersLogs[0].sessions[0].images.personImage).toBe("p1.jpg");
    expect(log.usersLogs[0].sessions[0].images.frameImage).toBe("f1.jpg");
    expect(log.usersLogs[0].sessions[1].images.personImage).toBe(""); // default
    expect(log.usersLogs[0].sessions[1].images.frameImage).toBe(""); // default
    expect(log.usersLogs[0].sessions[0].timestamp).toBeInstanceOf(Date);
  });

  it("sub-session schema has no _id by design", async () => {
    const log = await ReworkedAccessLogs.create({
      admin,
      usersLogs: [
        {
          sessions: [
            {
              nvr: new mongoose.Types.ObjectId(),
              channel: new mongoose.Types.ObjectId(),
              personName: "Bob",
              images: { faceImage: "bob.jpg" },
            },
          ],
        },
      ],
    });
    expect(log.usersLogs[0].sessions[0]._id).toBeUndefined();
    // But the userSession sub-doc itself does get an _id (default for embedded arrays).
    expect(log.usersLogs[0]._id).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it("supports multiple user groups under the same admin/day", async () => {
    const u1 = new mongoose.Types.ObjectId();
    const u2 = new mongoose.Types.ObjectId();
    const log = await ReworkedAccessLogs.create({
      admin,
      usersLogs: [
        {
          userId: u1,
          sessions: [
            {
              nvr: new mongoose.Types.ObjectId(),
              channel: new mongoose.Types.ObjectId(),
              personName: "Alice",
              images: { faceImage: "a.jpg" },
            },
          ],
        },
        {
          userId: u2,
          sessions: [
            {
              nvr: new mongoose.Types.ObjectId(),
              channel: new mongoose.Types.ObjectId(),
              personName: "Bob",
              images: { faceImage: "b.jpg" },
            },
          ],
        },
      ],
    });
    expect(log.usersLogs).toHaveLength(2);
    expect(log.usersLogs.map((u) => u.userId.toString()).sort()).toEqual(
      [u1.toString(), u2.toString()].sort()
    );
  });
});
