/**
 * Integration test for the Shift Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Shift } = await import(
  "../../../core/v1/shifts/shifts.model.js"
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

describe("Shift model", () => {
  const adminId = new mongoose.Types.ObjectId();
  const base = () => ({ adminId, name: "Morning", color: "#ff0000" });

  it("requires adminId, name, and color", async () => {
    await expect(Shift.create({ name: "x", color: "#fff" })).rejects.toThrow();
    await expect(Shift.create({ adminId, color: "#fff" })).rejects.toThrow();
    await expect(Shift.create({ adminId, name: "x" })).rejects.toThrow();
  });

  it("creates with defaults — isActive true, settings counters 0", async () => {
    const s = await Shift.create(base());
    expect(s.isActive).toBe(true);
    expect(s.settings.lateLogin).toBe(0);
    expect(s.settings.earlyLogout).toBe(0);
  });

  it("stores per-day timings", async () => {
    const s = await Shift.create({
      ...base(),
      timings: {
        monday: { start: "09:00", end: "17:00", enabled: true },
        sunday: { start: "00:00", end: "00:00", enabled: false },
      },
    });
    expect(s.timings.monday.start).toBe("09:00");
    expect(s.timings.monday.enabled).toBe(true);
    expect(s.timings.sunday.enabled).toBe(false);
  });

  it("trims the name", async () => {
    const s = await Shift.create({ ...base(), name: "  Night  " });
    expect(s.name).toBe("Night");
  });
});
