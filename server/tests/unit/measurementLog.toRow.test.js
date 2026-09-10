import { describe, expect, it } from "vitest";
import { toRow, deviationOf, buildMatch } from "../../core/v2/measurementLogs/measurementLog.service.js";

// The QR label (qrMetadata) is always inches. DS `measuredData` has been seen
// in inches, cm and mm, and the breadth axis arrives as either `breadth` or
// `width`. toRow / deviationOf must normalise all of that against the label.
const label = { length: 72, breadth: 42, height: 5 };
const near = (row, l, w, h) => {
  const [ml, mw, mh] = row.measured.split(" × ").map(Number);
  expect(ml).toBeCloseTo(l, 0);
  expect(mw).toBeCloseTo(w, 0);
  expect(mh).toBeCloseTo(h, 0);
};

describe("measurementLog toRow — measured dimension normalisation", () => {
  it("reads cm measured data and converts to inches against the label", () => {
    const row = toRow(
      { _id: "1", status: "accepted", qrMetadata: label, measuredData: { length: 182.9, breadth: 106.7, height: 12.8 } },
      "Asia/Kolkata",
    );
    near(row, 72, 42, 5);
    expect(row.status).toBe("pass");
  });

  it("reads mm measured data and converts to inches", () => {
    const row = toRow(
      { _id: "2", status: "accepted", qrMetadata: label, measuredData: { length: 1829, breadth: 1067, height: 128 } },
      "Asia/Kolkata",
    );
    near(row, 72, 42, 5);
  });

  it("reads measured data already in inches", () => {
    const row = toRow(
      { _id: "3", status: "accepted", qrMetadata: label, measuredData: { length: 71.5, breadth: 41.8, height: 5.1 } },
      "Asia/Kolkata",
    );
    near(row, 71.5, 41.8, 5.1);
  });

  it("accepts the breadth axis under the `width` key", () => {
    const row = toRow(
      { _id: "4", status: "accepted", qrMetadata: label, measuredData: { length: 182.9, width: 106.7, height: 12.8 } },
      "Asia/Kolkata",
    );
    near(row, 72, 42, 5);
    expect(row.devB).not.toBe("—");
  });

  it("surfaces DS confidence and flags low-confidence captures", () => {
    const good = toRow({ _id: "1", status: "accepted", qrMetadata: label, measuredData: { length: 182.9, breadth: 106.7, height: 12.8, confidence: 0.91 } }, "Asia/Kolkata");
    const bad = toRow({ _id: "2", status: "accepted", qrMetadata: label, measuredData: { length: 169.04, breadth: 129.67, height: 48.19, confidence: 0.14 } }, "Asia/Kolkata");
    expect(good.confidence).toBe(0.91);
    expect(good.lowConfidence).toBe(false);
    expect(bad.lowConfidence).toBe(true);
  });

  it("keeps the raw DS values and the detected unit on the row", () => {
    const row = toRow(
      { _id: "5", status: "accepted", qrMetadata: label, measuredData: { length: 182.9, breadth: 106.7, height: 12.8 } },
      "Asia/Kolkata",
    );
    expect(row.measuredRaw).toBe("182.9 × 106.7 × 12.8");
    expect(row.measuredUnit).toBe("cm");
  });

  it("uses ONE unit for the whole record, never a per-axis mix", () => {
    // If each axis were matched independently, 300 would map to inches on a
    // 42in axis. As a whole record, cm fits best — so 300 stays 300/2.54.
    const row = toRow(
      { _id: "6", status: "accepted", qrMetadata: label, measuredData: { length: 182.9, breadth: 300, height: 12.8 } },
      "Asia/Kolkata",
    );
    const [, mw] = row.measured.split(" × ").map(Number);
    expect(mw).toBeCloseTo(300 / 2.54, 0);
  });

  it("flags an implausible capture instead of massaging it to look valid", () => {
    const row = toRow(
      { _id: "7", status: "accepted", qrMetadata: label, measuredData: { length: 169.04, breadth: 129.67, height: 48.19, confidence: 0.14 } },
      "Asia/Kolkata",
    );
    expect(row.implausible).toBe(true);
    expect(row.status).toBe("mismatch");
  });

  it("does not flag a good capture as implausible", () => {
    const row = toRow(
      { _id: "8", status: "accepted", qrMetadata: label, measuredData: { length: 182.9, breadth: 106.7, height: 12.8, confidence: 0.9 } },
      "Asia/Kolkata",
    );
    expect(row.implausible).toBe(false);
  });

  it("scopes the query to the fromDate / toDate window (used by list + analytics)", () => {
    const m = buildMatch(
      { query: { fromDate: "2026-08-02T00:00:00.000Z", toDate: "2026-08-11T23:59:59.999Z" } },
      "admin1",
    );
    expect(m.adminId).toBe("admin1");
    const range = m.$and?.[0]?.$or?.[0]?.dsProcessedAt;
    expect(range?.$gte).toEqual(new Date("2026-08-02T00:00:00.000Z"));
    expect(range?.$lte).toEqual(new Date("2026-08-11T23:59:59.999Z"));
  });

  it("flags a genuine out-of-tolerance capture as a mismatch", () => {
    const { status, devFrac } = deviationOf({
      status: "accepted",
      qrMetadata: label,
      measuredData: { length: 190, breadth: 106.7, height: 12.8 }, // +2.8in on L
    });
    expect(devFrac).toBeGreaterThan(1);
    expect(status).toBe("mismatch");
  });
});
