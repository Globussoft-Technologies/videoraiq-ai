/**
 * Integration test for the Attendance Mongoose model — including the nested
 * event schema and its "at least one image" validator.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Attendance } = await import(
  "../../../core/v1/attendance/attendance.model.js"
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

describe("Attendance model", () => {
  const user = new mongoose.Types.ObjectId();
  const employee = new mongoose.Types.ObjectId();

  it("requires user and employee", async () => {
    await expect(Attendance.create({ employee })).rejects.toThrow();
    await expect(Attendance.create({ user })).rejects.toThrow();
  });

  it("creates an attendance record with no events", async () => {
    const a = await Attendance.create({ user, employee });
    expect(a.events).toEqual([]);
    expect(a.createdAt).toBeInstanceOf(Date);
  });

  it("accepts an event with a valid cameraType and at least one image", async () => {
    const a = await Attendance.create({
      user,
      employee,
      events: [
        {
          cameraType: "checkin",
          images: { face: "http://cdn/face.jpg" },
        },
      ],
    });
    expect(a.events).toHaveLength(1);
    expect(a.events[0].cameraType).toBe("checkin");
    expect(a.events[0].timestamp).toBeInstanceOf(Date);
  });

  it("rejects an event with an invalid cameraType", async () => {
    await expect(
      Attendance.create({
        user,
        employee,
        events: [{ cameraType: "sideways", images: { face: "x" } }],
      })
    ).rejects.toThrow();
  });

  it("accepts an event with an empty images object — validator is NOT enforced", async () => {
    // The `images` path is not `required`, so an empty `images: {}` is
    // treated as unset and the "at least one image" validator never runs.
    // This contradicts the validator's stated intent — tracked as a bug;
    // see videoraiq-ai#29. This test pins the CURRENT behavior.
    const a = await Attendance.create({
      user,
      employee,
      events: [{ cameraType: "checkin", images: {} }],
    });
    expect(a.events).toHaveLength(1);
  });

  it("accepts checkout events and a confidence score", async () => {
    const a = await Attendance.create({
      user,
      employee,
      events: [
        {
          cameraType: "checkout",
          images: { person: "http://cdn/p.jpg" },
          confidenceScore: 0.97,
        },
      ],
    });
    expect(a.events[0].confidenceScore).toBeCloseTo(0.97);
  });
});
