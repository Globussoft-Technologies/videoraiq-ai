import { describe, it, expect } from "vitest";

// Import after vitest setup ran — NODE_CONFIG is already populated.
import AUTHService from "../../../core/v1/Auth/auth.service.js";

describe("AUTHService.extractSubscriptions", () => {
  it("collapses access records into productId → latest expiry", () => {
    const access = {
      0: { product_id: 1001, expire_date: "2025-01-01" },
      1: { product_id: 1001, expire_date: "2026-01-01" },
      2: { product_id: 1002, expire_date: "2025-06-01" },
      _total: 3,
    };
    expect(AUTHService.extractSubscriptions(access)).toEqual({
      1001: "2026-01-01",
      1002: "2025-06-01",
    });
  });

  it("ignores the _total key", () => {
    expect(
      AUTHService.extractSubscriptions({
        _total: 2,
        0: { product_id: 1, expire_date: "2025-12-31" },
      })
    ).toEqual({ 1: "2025-12-31" });
  });

  it("returns empty object for empty input", () => {
    expect(AUTHService.extractSubscriptions({})).toEqual({});
    expect(AUTHService.extractSubscriptions({ _total: 0 })).toEqual({});
  });

  it("keeps the LATER expiry when multiple records share a product", () => {
    const result = AUTHService.extractSubscriptions({
      0: { product_id: 7, expire_date: "2020-01-01" },
      1: { product_id: 7, expire_date: "2030-01-01" },
      2: { product_id: 7, expire_date: "2025-01-01" },
    });
    expect(result[7]).toBe("2030-01-01");
  });
});

describe("AUTHService.isPlanActive", () => {
  const future = () =>
    new Date(Date.now() + 86400e3).toISOString().slice(0, 10); // tomorrow
  const past = () =>
    new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10); // 7d ago

  it("returns true when ANY subscription is still valid", () => {
    expect(
      AUTHService.isPlanActive({
        userSubscriptionType: { 1: past(), 2: future() },
      })
    ).toBe(true);
  });

  it("returns false when ALL subscriptions are expired", () => {
    expect(
      AUTHService.isPlanActive({
        userSubscriptionType: { 1: past(), 2: past() },
      })
    ).toBe(false);
  });

  it("reads `subscriptions` as a fallback when userSubscriptionType is absent", () => {
    expect(AUTHService.isPlanActive({ subscriptions: { 1: future() } })).toBe(
      true
    );
  });

  it("returns false for missing / invalid subscriptions object", () => {
    expect(AUTHService.isPlanActive({})).toBe(false);
    expect(AUTHService.isPlanActive({ subscriptions: null })).toBe(false);
    expect(AUTHService.isPlanActive({ subscriptions: "garbage" })).toBe(false);
  });

  it("treats unparseable dates as inactive (not throwing)", () => {
    expect(
      AUTHService.isPlanActive({ subscriptions: { 1: "not a date" } })
    ).toBe(false);
  });

  it("expiry boundary uses end-of-day UTC", () => {
    // Today's date in UTC — still active until 23:59:59.999 UTC.
    const today = new Date().toISOString().slice(0, 10);
    expect(
      AUTHService.isPlanActive({ subscriptions: { 1: today } })
    ).toBe(true);
  });
});

describe("AUTHService.transformData", () => {
  it("falls back to defaults when input is empty", () => {
    const r = AUTHService.transformData({});
    expect(r["Connected Cameras"]).toBe(4);
    expect(r["Storage Type"]).toEqual(["Local", "Cloud"]);
    expect(r.planDetails.name).toBe("Basic Monitoring Plan");
  });

  it("merges planDetails over the default", () => {
    const r = AUTHService.transformData({
      planDetails: { name: "Custom", price: "$10" },
    });
    expect(r.planDetails.name).toBe("Custom");
    expect(r.planDetails.price).toBe("$10");
    expect(r.planDetails.access).toBe("Basic Monitoring"); // default preserved
  });

  it("rejects an empty Storage Type array (keeps default)", () => {
    const r = AUTHService.transformData({ "Storage Type": [] });
    expect(r["Storage Type"]).toEqual(["Local", "Cloud"]);
  });

  it("respects boolean overrides", () => {
    const r = AUTHService.transformData({ "Cloud Backup": true });
    expect(r["Cloud Backup"]).toBe(true);
  });
});

describe("AUTHService.transformTopUpData", () => {
  it("applies tiered top-ups based on summed input", () => {
    const r = AUTHService.transformTopUpData([10, 20, 25]); // sum = 55
    expect(r["Connected Cameras"]).toBe(4 + 2); // ≥ $10
    expect(r["Video Storage (Days)"]).toBe(7 + 3); // ≥ $20
    expect(r["Cloud Backup"]).toBe(true); // ≥ $30
    expect(r["AI-Based Intrusion Detection"]).toBe(true); // ≥ $40
    expect(r["Video Quality"]).toBe("1080p"); // ≥ $50
    expect(r.planDetails.price).toBe("$55");
  });

  it("zero / non-array input falls back to defaults + $0 price", () => {
    const r = AUTHService.transformTopUpData(null);
    expect(r["Connected Cameras"]).toBe(4);
    expect(r["Cloud Backup"]).toBe(false);
    expect(r.planDetails.price).toBe("$0");
  });
});
