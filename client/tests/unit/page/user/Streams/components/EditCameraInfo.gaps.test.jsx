/**
 * Gap-fills for src/page/user/Streams/components/EditCameraInfo.jsx
 *
 * Uncovered lines 98-109 are inside the react-select `styles` prop object
 * (the `input`, `singleValue`, and `menuPortal` style functions). They are
 * never invoked unless react-select actually calls them. The original
 * test's mock ignores `styles`. This mock invokes every style function
 * once with a stub base, so all branches run.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const stylesCalls = vi.hoisted(() => ({ value: null }));

vi.mock("react-select", () => ({
  default: ({ styles }) => {
    // Invoke every styles entry to exercise the style-builder branches.
    if (styles) {
      stylesCalls.value = {
        control: styles.control?.({}, {}),
        menu: styles.menu?.({}, {}),
        option: styles.option?.({}, { isFocused: false }),
        optionFocused: styles.option?.({}, { isFocused: true }),
        multiValue: styles.multiValue?.({}, {}),
        multiValueLabel: styles.multiValueLabel?.({}, {}),
        multiValueRemove: styles.multiValueRemove?.({}, {}),
        input: styles.input?.({}, {}),
        singleValue: styles.singleValue?.({}, {}),
        menuPortal: styles.menuPortal?.({}, {}),
      };
    }
    return <div data-testid="dept-select-stub" />;
  },
}));

const { default: EditCameraInfo } = await import(
  "../../../../../../src/page/user/Streams/components/EditCameraInfo.jsx"
);

describe("EditCameraInfo react-select styles gap-fills", () => {
  it("invokes every styles function and verifies the produced style shapes", () => {
    stylesCalls.value = null;
    render(
      <EditCameraInfo
        aliasInput=""
        setAliasInput={vi.fn()}
        selectedDepartments={[]}
        setSelectedDepartments={vi.fn()}
        departmentOptions={[]}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const s = stylesCalls.value;
    expect(s).not.toBeNull();

    // control
    expect(s.control.backgroundColor).toBe("rgba(0, 0, 0, 0.2)");
    expect(s.control.minHeight).toBe("36px");

    // menu
    expect(s.menu.backgroundColor).toBe("#171717");

    // option — focused vs not
    expect(s.option.backgroundColor).toBe("transparent");
    expect(s.optionFocused.backgroundColor).toBe("#262626");
    expect(s.option.color).toBe("white");
    expect(s.option.fontSize).toBe("12px");

    // multiValue / label / remove
    expect(s.multiValue.borderRadius).toBe("4px");
    expect(s.multiValueLabel.color).toBe("white");
    expect(s.multiValueRemove.color).toBe("white");
    expect(s.multiValueRemove[":hover"].backgroundColor).toBe("#ef4444");

    // input / singleValue (these are the uncovered lines)
    expect(s.input.color).toBe("white");
    expect(s.singleValue.color).toBe("white");

    // menuPortal (uncovered)
    expect(s.menuPortal.zIndex).toBe(9999);
  });
});
