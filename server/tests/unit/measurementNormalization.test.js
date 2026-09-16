import { describe, expect, it } from "vitest";
import { normalizeMeasuredData } from "../../core/v2/measurementIncidents/measurementNormalization.js";

const declared = { length: 72, breadth: 42, height: 6 };

describe("measurement incident normalization", () => {
  it("snaps each inch measurement to the QR value within the inclusive one-inch boundary", () => {
    const normalized = normalizeMeasuredData(
      { length: 71, breadth: 42.8, height: 5.2, confidence: 0.91 },
      declared,
    );

    expect(normalized).toEqual({ length: 72, breadth: 42, height: 6, confidence: 0.91 });
  });

  it("does not snap a value more than one inch away", () => {
    const normalized = normalizeMeasuredData(
      { length: 70.99, breadth: 43.01, height: 4.99 },
      declared,
    );

    expect(normalized).toEqual({ length: 70.99, breadth: 43.01, height: 4.99 });
  });

  it("detects centimetres for the complete record before applying the one-inch rule", () => {
    const normalized = normalizeMeasuredData(
      { length: 182.9, width: 106.7, height: 12.8, confidence: 0.82 },
      { length: 72, breadth: 42, height: 5 },
    );

    expect(normalized).toEqual({
      length: 72,
      width: 42,
      breadth: 42,
      height: 5,
      confidence: 0.82,
    });
  });

  it("detects millimetres for the complete record", () => {
    const normalized = normalizeMeasuredData(
      { length: 1829, breadth: 1067, height: 128 },
      { length: 72, breadth: 42, height: 5 },
    );

    expect(normalized).toEqual({ length: 72, breadth: 42, height: 5 });
  });

  it("uses parsed custom dimensions before the flat QR dimensions", () => {
    const normalized = normalizeMeasuredData(
      { length: 76.2, breadth: 70.4, height: 5.2 },
      {
        length: 78,
        breadth: 72,
        height: 6,
        custom_dimensions: { length: 77, breadth: 71, height: 5 },
      },
    );

    expect(normalized).toEqual({ length: 77, breadth: 71, height: 5 });
  });
});
