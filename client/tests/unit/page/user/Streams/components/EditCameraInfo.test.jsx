/**
 * src/page/user/Streams/components/EditCameraInfo.jsx — small floating
 * popover for editing a single camera's alias + department assignment.
 * Pure controlled component: parent owns all state, this file just wires
 * inputs to setters and renders Cancel/Save buttons.
 *
 * Mocks (1): react-select - inline lightweight stub. The real component
 * portals its menu, which doesn't render well in jsdom; the stub exposes
 * value, onChange, and an options list so we can drive selection.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-select", () => ({
  default: ({ value, onChange, options = [], placeholder }) => (
    <select
      data-testid="dept-select"
      multiple
      value={(value || []).map((v) => v.value)}
      onChange={(e) => {
        const selectedIds = Array.from(e.target.selectedOptions).map((o) => o.value);
        const next = options.filter((o) => selectedIds.includes(o.value));
        onChange && onChange(next);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const { default: EditCameraInfo } = await import(
  "../../../../../../src/page/user/Streams/components/EditCameraInfo.jsx"
);

const defaultProps = () => ({
  aliasInput: "Lobby Cam",
  setAliasInput: vi.fn(),
  selectedDepartments: [],
  setSelectedDepartments: vi.fn(),
  departmentOptions: [
    { value: "d1", label: "Security" },
    { value: "d2", label: "Reception" },
  ],
  isSaving: false,
  onSave: vi.fn(),
  onCancel: vi.fn(),
});

describe("EditCameraInfo", () => {
  it("renders the heading, alias input value, and both action buttons", () => {
    render(<EditCameraInfo {...defaultProps()} />);
    expect(screen.getByText("Camera Settings")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter camera alias")).toHaveValue(
      "Lobby Cam"
    );
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Save Details/i })
    ).toBeInTheDocument();
  });

  it("typing in the alias input calls setAliasInput with the new value", () => {
    const props = defaultProps();
    render(<EditCameraInfo {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Enter camera alias"), {
      target: { value: "Front Door" },
    });
    expect(props.setAliasInput).toHaveBeenCalledWith("Front Door");
  });

  it("clicking the X (close) button calls onCancel", () => {
    const props = defaultProps();
    render(<EditCameraInfo {...props} />);
    // The X button is the first button — it precedes the form section.
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("clicking Cancel calls onCancel", () => {
    const props = defaultProps();
    render(<EditCameraInfo {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("clicking Save Details calls onSave when not saving", () => {
    const props = defaultProps();
    render(<EditCameraInfo {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Save Details/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("Save Details is disabled and shows spinner when isSaving=true", () => {
    const props = { ...defaultProps(), isSaving: true };
    const { container } = render(<EditCameraInfo {...props} />);
    // Find the save button by partial class — it has the unique blue bg.
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.className.includes("bg-[#07486A]")
    );
    expect(saveBtn).toBeTruthy();
    expect(saveBtn).toBeDisabled();
    // No "Save Details" text — replaced by spinner div.
    expect(screen.queryByText("Save Details")).not.toBeInTheDocument();
    // The spinner has the animate-spin class.
    expect(saveBtn.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders the department react-select stub with provided options", () => {
    const props = defaultProps();
    render(<EditCameraInfo {...props} />);
    const select = screen.getByTestId("dept-select");
    expect(select).toBeInTheDocument();
    expect(select.querySelectorAll("option[value='d1']").length).toBe(1);
    expect(select.querySelectorAll("option[value='d2']").length).toBe(1);
  });

  it("changing the department select calls setSelectedDepartments with picked options", () => {
    const props = defaultProps();
    render(<EditCameraInfo {...props} />);
    const select = screen.getByTestId("dept-select");
    // Simulate user picking the first real option.
    fireEvent.change(select, { target: { value: "d1" } });
    expect(props.setSelectedDepartments).toHaveBeenCalled();
    const arg = props.setSelectedDepartments.mock.calls[0][0];
    expect(arg).toEqual([{ value: "d1", label: "Security" }]);
  });

  it("clicking inside the popover stops propagation (does not bubble)", () => {
    const outerClick = vi.fn();
    const props = defaultProps();
    const { container } = render(
      <div onClick={outerClick}>
        <EditCameraInfo {...props} />
      </div>
    );
    // Click the popover root directly (the outermost div of EditCameraInfo).
    const popoverRoot = container.querySelector(".absolute");
    fireEvent.click(popoverRoot);
    expect(outerClick).not.toHaveBeenCalled();
  });
});
