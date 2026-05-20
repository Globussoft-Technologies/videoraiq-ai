/**
 * `detectionOptions` is a static lookup used by the detection settings UI to
 * present a Person/Vehicle/Bag categorisation. The contract is "non-empty,
 * arrays of strings, no duplicates" — anything else would break the dropdowns.
 */
import { describe, it, expect } from "vitest";
import { detectionOptions } from "../../../src/data/detectionOptions.js";

describe("detectionOptions data", () => {
  it("exposes the three top-level categories", () => {
    expect(Object.keys(detectionOptions).sort()).toEqual(["Bag", "Person", "Vehicle"]);
  });

  it("every category maps to a non-empty array", () => {
    for (const key of Object.keys(detectionOptions)) {
      expect(Array.isArray(detectionOptions[key])).toBe(true);
      expect(detectionOptions[key].length).toBeGreaterThan(0);
    }
  });

  it("every entry is a non-empty string", () => {
    for (const values of Object.values(detectionOptions)) {
      for (const v of values) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("contains no duplicate values within a category", () => {
    for (const [key, values] of Object.entries(detectionOptions)) {
      const unique = new Set(values);
      expect(unique.size, `category ${key} has duplicates`).toBe(values.length);
    }
  });

  it("Person includes Adult/Child/Senior", () => {
    expect(detectionOptions.Person).toEqual(
      expect.arrayContaining(["Adult", "Child", "Senior"])
    );
  });

  it("Vehicle includes common road vehicles", () => {
    expect(detectionOptions.Vehicle).toEqual(
      expect.arrayContaining(["Car", "Truck", "Bus"])
    );
  });

  it("Bag includes Backpack and Suitcase", () => {
    expect(detectionOptions.Bag).toEqual(
      expect.arrayContaining(["Backpack", "Suitcase"])
    );
  });
});
