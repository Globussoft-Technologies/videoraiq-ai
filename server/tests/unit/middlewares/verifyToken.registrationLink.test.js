import { describe, expect, it } from "vitest";
import { isRegistrationLinkActive } from "../../../middlewares/verifyToken.js";

describe("isRegistrationLinkActive", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");

  it("accepts normal tokens and only the matching unexpired registration link", () => {
    expect(isRegistrationLinkActive({}, null, now)).toBe(true);
    expect(isRegistrationLinkActive(
      { registrationLinkId: "current" },
      { linkId: "current", expiresAt: "2026-01-02T00:00:00.000Z" },
      now
    )).toBe(true);
    expect(isRegistrationLinkActive(
      { registrationLinkId: "old" },
      { linkId: "current", expiresAt: "2026-01-02T00:00:00.000Z" },
      now
    )).toBe(false);
    expect(isRegistrationLinkActive(
      { registrationLinkId: "current" },
      { linkId: "current", expiresAt: "2025-12-31T00:00:00.000Z" },
      now
    )).toBe(false);
  });
});
