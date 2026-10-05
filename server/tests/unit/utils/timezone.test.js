import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_TIMEZONE,
  getRequestTimezone,
  validTimezone,
} from "../../../utils/timezone.js";

describe("admin timezone resolver", () => {
  it("uses the authenticated admin timezone", () => {
    const req = { verified: { userData: { timezone: "America/New_York" } } };
    expect(getRequestTimezone(req)).toBe("America/New_York");
  });

  it("defaults missing and invalid values to Asia/Kolkata", () => {
    expect(DEFAULT_ADMIN_TIMEZONE).toBe("Asia/Kolkata");
    expect(getRequestTimezone({ verified: { userData: {} } })).toBe("Asia/Kolkata");
    expect(getRequestTimezone({ verified: { userData: { timezone: "Not/AZone" } } })).toBe("Asia/Kolkata");
  });

  it("does not read a query-string timezone override", () => {
    const req = {
      query: { timezone: "UTC" },
      verified: { userData: { timezone: "Europe/London" } },
    };
    expect(getRequestTimezone(req)).toBe("Europe/London");
  });

  it("accepts valid IANA aliases supported by the runtime", () => {
    expect(validTimezone("UTC")).toBe("UTC");
    expect(validTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});
