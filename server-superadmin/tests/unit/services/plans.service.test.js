/**
 * Plans catalog — request-body sanitising and aMember name matching.
 * Tests that: (1) only editable keys survive, so a client echoing back a whole
 * plan doc can't overwrite _id/timestamps, (2) features accept an array or a
 * textarea string, (3) plan names match aMember invoice titles case/space
 * insensitively — the basis of the client counts.
 */
import { describe, it, expect } from "vitest";
import { pickEditable, normalise } from "../../../core/v1/plans/plans.service.js";

describe("pickEditable", () => {
  it("keeps only editable keys", () => {
    const out = pickEditable({
      name: "Starter",
      _id: "deadbeef",
      createdAt: "2020-01-01",
      clientCount: 99,
    });
    expect(out).toEqual({ name: "Starter" });
  });

  it("omits keys that were not sent, so a partial update stays partial", () => {
    expect(pickEditable({ tagline: "Small sites" })).toEqual({ tagline: "Small sites" });
    expect(pickEditable({})).toEqual({});
  });

  it("accepts features as an array or as a newline/comma separated string", () => {
    expect(pickEditable({ features: ["Up to 8 cameras", " Email alerts "] }).features).toEqual([
      "Up to 8 cameras",
      "Email alerts",
    ]);
    expect(pickEditable({ features: "Up to 8 cameras\nEmail alerts, Face Recognition" }).features).toEqual([
      "Up to 8 cameras",
      "Email alerts",
      "Face Recognition",
    ]);
    expect(pickEditable({ features: "" }).features).toEqual([]);
  });

  it("coerces flags and sortOrder", () => {
    expect(pickEditable({ isPopular: "yes", archived: 0 })).toEqual({
      isPopular: true,
      archived: false,
    });
    expect(pickEditable({ sortOrder: "3" }).sortOrder).toBe(3);
    expect(pickEditable({ sortOrder: "junk" }).sortOrder).toBe(0);
  });

  it("distinguishes a cleared name from an absent one", () => {
    // "" is rejected by update(); undefined means "leave it alone".
    expect(pickEditable({ name: "  " }).name).toBe("");
    expect(pickEditable({}).name).toBeUndefined();
  });
});

describe("normalise", () => {
  it("matches aMember titles regardless of case and padding", () => {
    expect(normalise("  Pro  ")).toBe(normalise("pro"));
    expect(normalise("Enterprise")).toBe(normalise("ENTERPRISE"));
  });

  it("is null-safe so a missing invoice title can't throw", () => {
    expect(normalise(null)).toBe("");
    expect(normalise(undefined)).toBe("");
  });
});
