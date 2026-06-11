/**
 * Round 3 gap-fill for AddNewConfiguration.jsx
 *
 * The base spec is feature-complete but coverage only reaches 57.82%
 * because the bulk of the file is the `selectStyles` object — six
 * nested style-builder functions (control, indicatorSeparator, menu,
 * menuList, option, placeholder) that react-select would call at
 * render time. The react-select mock never invokes them, so they
 * count as uncovered (lines ~9-76).
 *
 * This spec captures the styles object handed to react-select and
 * invokes each builder directly with realistic base + state arguments,
 * asserting the merged style overrides come out as expected. That
 * gives v8 a real execution trace for each function.
 *
 * Mock budget: lifted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const stylesCaptureRef = vi.hoisted(() => ({ value: null }));

vi.mock("react-select", () => ({
  default: ({ styles }) => {
    stylesCaptureRef.value = styles;
    return null;
  },
}));

vi.mock(
  "../../../../../../src/page/user/Detection/components/ManageSettings",
  () => ({ default: () => null })
);

const getAllDetectionTypesMock = vi.hoisted(() => vi.fn());
vi.mock(
  "../../../../../../src/page/user/Detection/Api/get",
  () => ({ getAllDetectionTypes: getAllDetectionTypesMock })
);

const { default: AddNewConfiguration } = await import(
  "../../../../../../src/page/user/Detection/components/AddNewConfiguration.jsx"
);

beforeEach(() => {
  getAllDetectionTypesMock.mockResolvedValue({
    data: { body: { data: { detectionTypes: {} } } },
  });
  stylesCaptureRef.value = null;
});

describe("AddNewConfiguration — selectStyles builders (round 3)", () => {
  it("captures the styles object forwarded to react-select", () => {
    render(<AddNewConfiguration />);
    expect(stylesCaptureRef.value).toBeTruthy();
    // All six keys exist.
    for (const k of [
      "control",
      "indicatorSeparator",
      "menu",
      "menuList",
      "option",
      "placeholder",
    ]) {
      expect(typeof stylesCaptureRef.value[k]).toBe("function");
    }
  });

  it("control() merges base with explicit height + border + hover/focus reset", () => {
    render(<AddNewConfiguration />);
    const out = stylesCaptureRef.value.control({ existing: "x" });
    expect(out.existing).toBe("x");
    expect(out.height).toBe("48px");
    expect(out.borderRadius).toBe("10px");
    expect(out.border).toBe("1px solid #80808059");
    expect(out.backgroundColor).toBe("#FAFAFA");
    expect(out["&:hover"]).toMatchObject({
      outline: "none",
      boxShadow: "none",
    });
    expect(out["&:focus"]).toMatchObject({
      outline: "none",
      boxShadow: "none",
    });
    expect(out["&:focus-within"]).toMatchObject({
      outline: "none",
      boxShadow: "none",
    });
    expect(out["&:focus-visible"]).toMatchObject({
      outline: "none",
      boxShadow: "none",
    });
  });

  it("indicatorSeparator() returns a `display: none` shim", () => {
    render(<AddNewConfiguration />);
    expect(stylesCaptureRef.value.indicatorSeparator()).toEqual({
      display: "none",
    });
  });

  it("menu() merges base with #FAFAFA background + radius + border", () => {
    render(<AddNewConfiguration />);
    const out = stylesCaptureRef.value.menu({ existing: "y" });
    expect(out.existing).toBe("y");
    expect(out.backgroundColor).toBe("#FAFAFA");
    expect(out.borderRadius).toBe("10px");
    expect(out.border).toBe("1px solid #80808059");
  });

  it("menuList() merges base with max-height + scrollbar-hide rules", () => {
    render(<AddNewConfiguration />);
    const out = stylesCaptureRef.value.menuList({ existing: "z" });
    expect(out.existing).toBe("z");
    expect(out.maxHeight).toBe("280px");
    expect(out["&::-webkit-scrollbar"]).toEqual({
      width: "0px",
      display: "none",
    });
    expect(out.scrollbarWidth).toBe("none");
    expect(out.msOverflowStyle).toBe("none");
  });

  it("option(base, {isFocused: true}) picks the focused background", () => {
    render(<AddNewConfiguration />);
    const out = stylesCaptureRef.value.option(
      { padding: "0" },
      { isFocused: true }
    );
    expect(out.backgroundColor).toBe("#f1f1f1");
    expect(out.color).toBe("#333333");
  });

  it("option(base, {isFocused: false}) picks the default background", () => {
    render(<AddNewConfiguration />);
    const out = stylesCaptureRef.value.option({}, { isFocused: false });
    expect(out.backgroundColor).toBe("#FAFAFA");
  });

  it("placeholder() merges base with #333333 text + 14px font", () => {
    render(<AddNewConfiguration />);
    const out = stylesCaptureRef.value.placeholder({ existing: "w" });
    expect(out.existing).toBe("w");
    expect(out.color).toBe("#333333");
    expect(out.fontSize).toBe("14px");
    expect(out.fontWeight).toBe("400");
  });
});
