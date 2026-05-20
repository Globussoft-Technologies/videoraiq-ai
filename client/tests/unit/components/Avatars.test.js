/**
 * Avatars/index.js exports a single constant — the URL prefix used to build
 * DiceBear avatar URLs from a seed. Sanity-check the value is a usable
 * string that ends with `seed=` so callers can append a username directly.
 */
import { describe, it, expect } from "vitest";
import { USER_AVTAR_INITIALS } from "../../../src/components/Avatars/index.js";

describe("components/Avatars constant", () => {
  it("exports a string", () => {
    expect(typeof USER_AVTAR_INITIALS).toBe("string");
    expect(USER_AVTAR_INITIALS.length).toBeGreaterThan(0);
  });

  it("points at the DiceBear initials API", () => {
    expect(USER_AVTAR_INITIALS).toContain("api.dicebear.com");
    expect(USER_AVTAR_INITIALS).toContain("/initials/svg");
  });

  it("ends with a `seed=` parameter so callers can append directly", () => {
    expect(USER_AVTAR_INITIALS.endsWith("seed=")).toBe(true);
  });

  it("encodes the brand colours in the query string", () => {
    expect(USER_AVTAR_INITIALS).toContain("backgroundColor=CFEFFF");
    expect(USER_AVTAR_INITIALS).toContain("color=07486A");
  });

  it("yields a valid absolute URL when concatenated with a seed", () => {
    const url = USER_AVTAR_INITIALS + "alice";
    // URL constructor throws if the result isn't a valid absolute URL.
    expect(() => new URL(url)).not.toThrow();
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.searchParams.get("seed")).toBe("alice");
  });
});
