/**
 * NestedMultiSelect is a 490+ line component. This file focuses narrowly on:
 *
 *   1. The component renders without throwing for the two supported value
 *      shapes:
 *        - "nested" UI shape   ({ parent: { enabled, subcategories: {...} }})
 *        - "backend" shape     ({ parent: [ { name, enable, notify } ] })
 *   2. The trigger correctly shows the first selected parent's label
 *      after the backend->nested normalization at the top of the file,
 *      proving the heuristic in `selectedDetections` actually runs.
 *   3. Opening the dropdown surfaces both the parent and the child labels
 *      from the `options` prop.
 *   4. Clearing the dropdown emits onChange({}).
 *
 * We do NOT attempt to cover handleToggle's branching tree. That logic
 * deserves its own dedicated test file driven by direct calls — see the
 * report.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NestedMultiSelect from "../../../src/components/NestedMultiSelect.jsx";

const OPTIONS = [
  {
    value: "Person",
    objects: [{ name: "Adult" }, { name: "Child" }],
  },
  {
    value: "Vehicle",
    objects: [{ name: "Car" }, { name: "Bike" }],
  },
];

// "Backend shape" — value entries are arrays of {name, enable, notify}.
const backendValue = {
  Person: [
    { name: "Adult", enable: true, notify: false },
    { name: "Child", enable: false, notify: true },
  ],
};

// "Nested shape" — value entries are plain objects.
const nestedValue = {
  Vehicle: {
    enabled: true,
    subscribed: true,
    notified: false,
    subcategories: {
      car: { enabled: true, subscribed: true, notified: false },
    },
  },
};

describe("NestedMultiSelect", () => {
  it("renders the placeholder when the value is empty", () => {
    render(
      <NestedMultiSelect value={{}} onChange={vi.fn()} options={OPTIONS} />
    );
    expect(screen.getByText("Select objects...")).toBeInTheDocument();
  });

  it("renders without throwing when given a nested-shape value", () => {
    render(
      <NestedMultiSelect
        value={nestedValue}
        onChange={vi.fn()}
        options={OPTIONS}
      />
    );
    // The MultiSelect trigger shows the first selected option's label.
    // For nested shape with Vehicle.enabled = true, that's "Vehicle".
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Vehicle")).toBeInTheDocument();
  });

  it("normalizes a backend-shape value so the trigger shows the parent label", () => {
    // If normalization did NOT run, `value.Person` would be an array and
    // the iteration in `selectedIds` would crash or produce no selection.
    // We just check that the parent label surfaces on the trigger.
    render(
      <NestedMultiSelect
        value={backendValue}
        onChange={vi.fn()}
        options={OPTIONS}
      />
    );
    expect(screen.getByText("Person")).toBeInTheDocument();
  });

  it("opens the dropdown and shows parent + child option rows", () => {
    render(
      <NestedMultiSelect value={{}} onChange={vi.fn()} options={OPTIONS} />
    );
    fireEvent.click(screen.getByRole("combobox"));

    // Both parents render
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Vehicle")).toBeInTheDocument();
    // Children render
    expect(screen.getByText("Adult")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
    expect(screen.getByText("Car")).toBeInTheDocument();
    expect(screen.getByText("Bike")).toBeInTheDocument();
  });

  it("Clear All emits an empty object", () => {
    const onChange = vi.fn();
    render(
      <NestedMultiSelect
        value={nestedValue}
        onChange={onChange}
        options={OPTIONS}
      />
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Clear All"));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("falls through to an empty selection when value is null", () => {
    // The normalization helper guards against falsy values: passing null
    // should not crash, and the placeholder should be visible.
    render(
      <NestedMultiSelect value={null} onChange={vi.fn()} options={OPTIONS} />
    );
    expect(screen.getByText("Select objects...")).toBeInTheDocument();
  });
});
