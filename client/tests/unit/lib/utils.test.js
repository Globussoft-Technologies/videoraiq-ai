import { describe, it, expect } from "vitest";
import { cn } from "../../../src/lib/utils.js";

describe("cn (className merge helper)", () => {
  it("joins plain class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional object syntax (clsx)", () => {
    expect(cn({ active: true, hidden: false })).toBe("active");
  });

  it("supports arrays", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("merges conflicting Tailwind classes — last wins (tailwind-merge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps non-conflicting Tailwind classes", () => {
    expect(cn("p-2", "m-4")).toBe("p-2 m-4");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
  });

  it("resolves a realistic conditional case", () => {
    const disabled = true;
    expect(cn("px-3 py-1", disabled && "opacity-50")).toBe(
      "px-3 py-1 opacity-50"
    );
  });
});
