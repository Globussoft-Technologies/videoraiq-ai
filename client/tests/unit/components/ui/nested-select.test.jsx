/**
 * NestedSelect — two-stage Category + Type picker. Internally it composes the
 * project's own Select wrappers; mock @/components/ui/select so the dropdowns
 * render inline as plain selects we can drive with fireEvent.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, disabled, children }) => (
    <select
      data-testid={`select-${value === undefined ? "none" : value}`}
      value={value || ""}
      onChange={(e) => onValueChange?.(e.target.value)}
      disabled={disabled}
    >
      <option value="">__placeholder__</option>
      {children}
    </select>
  );
  const SelectTrigger = ({ children }) => <>{children}</>;
  const SelectValue = ({ placeholder }) => (
    <span data-mock="value">{placeholder}</span>
  );
  const SelectContent = ({ children }) => <>{children}</>;
  const SelectItem = ({ value, children }) => (
    <option value={value}>{children}</option>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const { NestedSelect } = await import(
  "../../../../src/components/ui/nested-select.jsx"
);

describe("NestedSelect", () => {
  it("renders category select with placeholder and only one dropdown when value is empty", () => {
    render(<NestedSelect value="" onValueChange={() => {}} />);
    // The mocked SelectValue renders the placeholder text
    const placeholders = screen.getAllByText("Select category");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
    // Only the category select rendered (no nested type label yet)
    expect(screen.queryByText(/Type \*/i)).toBeNull();
  });

  it("offers the three top-level category options", () => {
    const { container } = render(
      <NestedSelect value="" onValueChange={() => {}} />
    );
    expect(container.textContent).toMatch(/Person/);
    expect(container.textContent).toMatch(/Vehicle/);
    expect(container.textContent).toMatch(/Bag/);
  });

  it("renders the nested type picker when a category is already selected via value", () => {
    render(<NestedSelect value="person_adult" onValueChange={() => {}} />);
    expect(screen.getByText(/Person Type \*/)).toBeInTheDocument();
  });

  it("renders the Vehicle Type picker when value starts with 'vehicle_'", () => {
    render(<NestedSelect value="vehicle_car" onValueChange={() => {}} />);
    expect(screen.getByText(/Vehicle Type \*/)).toBeInTheDocument();
  });

  it("changing the category select clears the value (calls onValueChange(''))", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <NestedSelect value="person_adult" onValueChange={onValueChange} />
    );
    const selects = container.querySelectorAll("select");
    // First select = category. Change it to "vehicle" to trigger reset
    fireEvent.change(selects[0], { target: { value: "vehicle" } });
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("changing the nested select forwards the full nested value", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <NestedSelect value="bag_backpack" onValueChange={onValueChange} />
    );
    const selects = container.querySelectorAll("select");
    // Second select = nested type
    fireEvent.change(selects[1], { target: { value: "bag_handbag" } });
    expect(onValueChange).toHaveBeenCalledWith("bag_handbag");
  });

  it("disables both selects when disabled=true", () => {
    const { container } = render(
      <NestedSelect value="person_adult" onValueChange={() => {}} disabled />
    );
    container.querySelectorAll("select").forEach((s) => {
      expect(s.disabled).toBe(true);
    });
  });
});
