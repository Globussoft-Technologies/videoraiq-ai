/**
 * Integration test for the Shift Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Shift, resolveShiftDay, weekOffDays } = await import(
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

  it("requires adminId and name", async () => {
    await expect(Shift.create({ name: "x", color: "#fff" })).rejects.toThrow();
    await expect(Shift.create({ adminId, color: "#fff" })).rejects.toThrow();
  });

  // The Create Shift form has no colour picker — the service picks one off a
  // palette — so an omitted colour has to fall back rather than reject.
  it("defaults the colour when none is given", async () => {
    const s = await Shift.create({ adminId, name: "Morning" });
    expect(s.color).toBe("#6366f1");
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

  it("defaults to a Mon-Fri working week with a 09:00-18:00 window", async () => {
    const s = await Shift.create(base());
    expect(s.startTime).toBe("09:00");
    expect(s.endTime).toBe("18:00");
    expect(s.breakMinutes).toBe(60);
    expect(s.workingDays.monday.type).toBe("full");
    expect(s.workingDays.saturday.type).toBe("off");
    expect(weekOffDays(s)).toEqual(["sunday", "saturday"]);
  });

  it("flags a window that wraps past midnight as a night shift", async () => {
    const night = await Shift.create({ ...base(), startTime: "22:00", endTime: "06:00" });
    expect(night.isNightShift).toBe(true);

    const day = await Shift.create({ ...base(), name: "Day", startTime: "09:00", endTime: "18:00" });
    expect(day.isNightShift).toBe(false);
  });

  // Legacy readers (the attendance not-checked-in roster) only understand
  // `timings.<day>.enabled`, so every write has to keep it in step.
  it("mirrors workingDays into the legacy timings block", async () => {
    const s = await Shift.create({
      ...base(),
      startTime: "10:00",
      endTime: "19:00",
      workingDays: {
        monday: { type: "full" },
        saturday: { type: "half" },
        sunday: { type: "off" },
      },
    });
    expect(s.timings.monday).toMatchObject({ enabled: true, start: "10:00", end: "19:00" });
    // A half day still expects the employee on site.
    expect(s.timings.saturday.enabled).toBe(true);
    expect(s.timings.sunday.enabled).toBe(false);
  });

  it("mirrors the grace periods into the legacy settings block", async () => {
    const s = await Shift.create({ ...base(), graceLateMinutes: 15, graceEarlyMinutes: 10 });
    expect(s.settings.lateLogin).toBe(15);
    expect(s.settings.earlyLogout).toBe(10);
  });

  it("honours a per-day window override", async () => {
    const s = await Shift.create({
      ...base(),
      startTime: "09:00",
      endTime: "18:00",
      workingDays: { saturday: { type: "half", start: "09:00", end: "13:00" } },
    });
    expect(resolveShiftDay(s, "saturday")).toEqual({
      type: "half",
      start: "09:00",
      end: "13:00",
    });
    expect(resolveShiftDay(s, "monday")).toEqual({
      type: "full",
      start: "09:00",
      end: "18:00",
    });
  });

  // Documents written before `workingDays` existed still have to grade
  // correctly, which is what lets this ship without a data migration.
  it("falls back to the legacy timings block for pre-rework documents", async () => {
    const legacy = {
      startTime: "09:00",
      endTime: "18:00",
      timings: { monday: { enabled: false, start: "09:00", end: "17:00" } },
      workingDays: undefined,
    };
    expect(resolveShiftDay(legacy, "monday")).toEqual({
      type: "off",
      start: "09:00",
      end: "17:00",
    });
  });
});
