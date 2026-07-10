/**
 * Integration tests for additional uncovered Mongoose models:
 *   - Storage (with pre("save") hook that deactivates other storage docs
 *     for the same user)
 *   - autoEmailReportSchema (frequency / Recipients / Content / filter)
 *   - AccessLogs (legacy session-array schema)
 *   - OptimizedAccessLogs (newAccessLogs.model.js — multi-index version)
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

const { default: Storage } = await import(
  "../../../core/v1/storage/storage.model.js"
);
const { default: AutoEmailReport } = await import(
  "../../../core/v1/autoEmailReport/autoEmailReport.model.js"
);
const { default: AccessLogs } = await import(
  "../../../core/v1/accesslogs/accesslogs.model.js"
);
const { default: OptimizedAccessLogs } = await import(
  "../../../core/v1/accesslogs/newAccessLogs.model.js"
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

// ---------------------------------------------------------------------------
// Storage model — requires userId, name, type (enum), credentials.
// pre("save") hook deactivates other Storage docs with the same userId.
// ---------------------------------------------------------------------------

describe("Storage model", () => {
  const userId = new mongoose.Types.ObjectId();

  it("requires userId, name, type, and credentials", async () => {
    await expect(
      Storage.create({ name: "x", type: "s3", credentials: { k: 1 } }),
    ).rejects.toThrow();
    await expect(
      Storage.create({ userId, type: "s3", credentials: { k: 1 } }),
    ).rejects.toThrow();
    await expect(
      Storage.create({ userId, name: "x", credentials: { k: 1 } }),
    ).rejects.toThrow();
    await expect(
      Storage.create({ userId, name: "x", type: "s3" }),
    ).rejects.toThrow();
  });

  it("only allows the documented storage types", async () => {
    await expect(
      Storage.create({
        userId,
        name: "weird",
        type: "ftp",
        credentials: { k: 1 },
      }),
    ).rejects.toThrow();
    const s = await Storage.create({
      userId,
      name: "ok",
      type: "google_drive_oauth",
      credentials: { token: "x" },
    });
    expect(s.type).toBe("google_drive_oauth");
  });

  it("defaults active=true and isValid=true", async () => {
    const s = await Storage.create({
      userId,
      name: "main",
      type: "s3",
      credentials: { bucket: "b" },
    });
    expect(s.active).toBe(true);
    expect(s.isValid).toBe(true);
  });

  it("pre('save') deactivates earlier storage docs for the same user", async () => {
    const a = await Storage.create({
      userId,
      name: "A",
      type: "s3",
      credentials: { bucket: "a" },
    });
    const b = await Storage.create({
      userId,
      name: "B",
      type: "sftp",
      credentials: { host: "h" },
    });
    const refreshed = await Storage.findById(a._id);
    // The newer "B" save flipped the older "A" doc to active=false.
    expect(refreshed.active).toBe(false);
    expect(b.active).toBe(true);
  });

  it("pre('save') only affects docs that share the same userId", async () => {
    const otherUser = new mongoose.Types.ObjectId();
    const a = await Storage.create({
      userId,
      name: "A",
      type: "s3",
      credentials: { bucket: "a" },
    });
    await Storage.create({
      userId: otherUser,
      name: "Other",
      type: "sftp",
      credentials: { host: "h" },
    });
    const refreshed = await Storage.findById(a._id);
    expect(refreshed.active).toBe(true); // other user's save did not touch ours
  });
});

// ---------------------------------------------------------------------------
// autoEmailReport model — has freeform nested frequency / Content / filter
// sub-docs with `default: '00:00'` on Time.
// ---------------------------------------------------------------------------

describe("autoEmailReport model", () => {
  it("requires reportsTitle", async () => {
    await expect(AutoEmailReport.create({})).rejects.toThrow();
  });

  it("creates with only reportsTitle and applies timestamps", async () => {
    const r = await AutoEmailReport.create({ reportsTitle: "Daily Summary" });
    expect(r.reportsTitle).toBe("Daily Summary");
    expect(r.createdAt).toBeInstanceOf(Date);
    expect(r.updatedAt).toBeInstanceOf(Date);
    expect(r.Recipients).toEqual([]);
  });

  it("defaults frequency entry Time to '00:00'", async () => {
    const r = await AutoEmailReport.create({
      reportsTitle: "Weekly",
      frequency: [{ Weekly: 1 }],
    });
    expect(r.frequency).toHaveLength(1);
    expect(r.frequency[0].Time).toBe("00:00");
  });

  it("stores nested filter, Recipients, Content, ReportsType", async () => {
    const r = await AutoEmailReport.create({
      reportsTitle: "Custom",
      Recipients: ["alice@example.com", "bob@example.com"],
      Content: [{ consolidatedReport: 1, task: 0, clients: 1 }],
      ReportsType: [{ pdf: 1, csv: 0 }],
      filter: {
        wholeOrganization: 0,
        specificEmployees: [{ id: "emp-1" }, { id: "emp-2" }],
      },
      sendTestMail: true,
    });
    expect(r.Recipients).toEqual(["alice@example.com", "bob@example.com"]);
    expect(r.Content[0].consolidatedReport).toBe(1);
    expect(r.ReportsType[0].pdf).toBe(1);
    expect(r.filter.specificEmployees).toHaveLength(2);
    expect(r.filter.specificEmployees[0].id).toBe("emp-1");
    expect(r.sendTestMail).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AccessLogs (legacy) — requires admin + each session needs personName +
// faceImage (sub-doc default "" but required:true keeps the path resolvable).
// ---------------------------------------------------------------------------

describe("AccessLogs (legacy) model", () => {
  const admin = new mongoose.Types.ObjectId();

  it("requires admin", async () => {
    await expect(AccessLogs.create({})).rejects.toThrow();
  });

  it("creates with empty sessions array by default", async () => {
    const log = await AccessLogs.create({ admin });
    expect(log.sessions).toEqual([]);
    expect(log.userId).toBeNull(); // default
    expect(log.date).toBeInstanceOf(Date);
  });

  it("requires personName on each session", async () => {
    await expect(
      AccessLogs.create({
        admin,
        sessions: [{ nvr: new mongoose.Types.ObjectId() }],
      }),
    ).rejects.toThrow();
  });

  it("accepts a session with personName + nested images and userId", async () => {
    const userId = new mongoose.Types.ObjectId();
    const log = await AccessLogs.create({
      admin,
      userId,
      sessions: [
        {
          nvr: new mongoose.Types.ObjectId(),
          channel: new mongoose.Types.ObjectId(),
          personName: "Alice",
          images: { faceImage: "face.jpg", personImage: "p.jpg" },
        },
      ],
    });
    expect(log.userId.toString()).toBe(userId.toString());
    expect(log.sessions[0].personName).toBe("Alice");
    expect(log.sessions[0].images.faceImage).toBe("face.jpg");
    expect(log.sessions[0].images.frameImage).toBe(""); // default
  });
});

// ---------------------------------------------------------------------------
// OptimizedAccessLogs (newAccessLogs.model.js) — same shape but with extra
// indexes; sub-sessions require nvr / channel / personName (no required
// faceImage on this newer schema).
// ---------------------------------------------------------------------------

describe("OptimizedAccessLogs model", () => {
  const admin = new mongoose.Types.ObjectId();

  it("requires admin", async () => {
    await expect(OptimizedAccessLogs.create({})).rejects.toThrow();
  });

  it("creates with empty sessions and a default date", async () => {
    const log = await OptimizedAccessLogs.create({ admin });
    expect(log.sessions).toEqual([]);
    expect(log.date).toBeInstanceOf(Date);
  });

  it("requires session.nvr, session.channel, session.personName", async () => {
    await expect(
      OptimizedAccessLogs.create({
        admin,
        sessions: [{ personName: "Alice" }],
      }),
    ).rejects.toThrow();
    await expect(
      OptimizedAccessLogs.create({
        admin,
        sessions: [
          {
            nvr: new mongoose.Types.ObjectId(),
            channel: new mongoose.Types.ObjectId(),
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("accepts a complete session including confidenceScore", async () => {
    const log = await OptimizedAccessLogs.create({
      admin,
      sessions: [
        {
          nvr: new mongoose.Types.ObjectId(),
          channel: new mongoose.Types.ObjectId(),
          personName: "Alice",
          confidenceScore: 0.92,
          images: { faceImage: "face.jpg" },
        },
      ],
    });
    expect(log.sessions[0].personName).toBe("Alice");
    expect(log.sessions[0].confidenceScore).toBeCloseTo(0.92);
    expect(log.sessions[0].timestamp).toBeInstanceOf(Date);
  });
});
