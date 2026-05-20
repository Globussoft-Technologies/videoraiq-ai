/**
 * MultiSelect is a plain dropdown (no Radix Portal). Cover:
 * - placeholder when nothing is selected and first-label + "+N more" badge
 * - opening/closing the dropdown via the trigger
 * - Select All / Clear All behaviour
 * - searching narrows the option list
 * - clicking an option toggles inclusion in `value`
 * - disabled and isNvrHeader items skip selection
 * - location-type uses option.label instead of option.id
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiSelect from "../../../../src/components/ui/multiselect.jsx";

const optionsBasic = [
  { id: "1", label: "Alpha" },
  { id: "2", label: "Bravo" },
  { id: "3", label: "Charlie", disabled: true },
  { id: "header", label: "Group", isNvrHeader: true },
  { id: "4", label: "Delta" },
];

function openDropdown() {
  // The combobox role is on the trigger div
  fireEvent.click(screen.getByRole("combobox"));
}

describe("ui/MultiSelect", () => {
  it("renders the placeholder when no value is selected", () => {
    render(<MultiSelect options={optionsBasic} value={[]} onChange={() => {}} placeholder="Pick one" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("shows the first selected label and a '+N more' badge for multi-selections", () => {
    render(
      <MultiSelect options={optionsBasic} value={["1", "2"]} onChange={() => {}} />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("opens the dropdown when the trigger is clicked", () => {
    render(<MultiSelect options={optionsBasic} value={[]} onChange={() => {}} />);
    expect(screen.queryByText("Select All")).toBeNull();
    openDropdown();
    expect(screen.getByText("Select All")).toBeInTheDocument();
    expect(screen.getByText("Clear All")).toBeInTheDocument();
  });

  it("renders the option labels (incl. header) when open", () => {
    render(<MultiSelect options={optionsBasic} value={[]} onChange={() => {}} />);
    openDropdown();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Delta")).toBeInTheDocument();
  });

  it("toggles a selection on click and propagates through onChange", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={optionsBasic} value={[]} onChange={onChange} />);
    openDropdown();
    fireEvent.click(screen.getByText("Bravo"));
    expect(onChange).toHaveBeenLastCalledWith(["2"]);
  });

  it("does NOT toggle disabled options", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={optionsBasic} value={[]} onChange={onChange} />);
    openDropdown();
    // Disabled rows render outside the click wrapper, but clicking the
    // input on a disabled option must not call onChange.
    const charlie = screen.getByText("Charlie");
    fireEvent.click(charlie);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT toggle on header rows", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={optionsBasic} value={[]} onChange={onChange} />);
    openDropdown();
    fireEvent.click(screen.getByText("Group"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Select All selects every non-disabled, non-header option", () => {
    const onChange = vi.fn();
    const onSelectAll = vi.fn();
    render(
      <MultiSelect
        options={optionsBasic}
        value={[]}
        onChange={onChange}
        onSelectAll={onSelectAll}
      />
    );
    openDropdown();
    fireEvent.click(screen.getByText("Select All"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0];
    expect(arg).toEqual(expect.arrayContaining(["1", "2", "4"]));
    expect(arg).not.toContain("3"); // disabled
    expect(arg).not.toContain("header");
    expect(onSelectAll).toHaveBeenCalled();
  });

  it("Clear All resets the value to an empty array", () => {
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(
      <MultiSelect
        options={optionsBasic}
        value={["1", "2"]}
        onChange={onChange}
        onClearAll={onClearAll}
      />
    );
    openDropdown();
    fireEvent.click(screen.getByText("Clear All"));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it("searching filters the visible option list", () => {
    render(<MultiSelect options={optionsBasic} value={[]} onChange={() => {}} />);
    openDropdown();
    const search = screen.getByPlaceholderText("Search...");
    fireEvent.change(search, { target: { value: "bra" } });
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText("Delta")).toBeNull();
  });

  it("shows the empty message when no options match the search", () => {
    render(
      <MultiSelect
        options={optionsBasic}
        value={[]}
        onChange={() => {}}
        msg="Nothing here"
      />
    );
    openDropdown();
    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("for type='location', clicks select by label and selected display uses label", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        options={optionsBasic}
        value={[]}
        onChange={onChange}
        type="location"
      />
    );
    openDropdown();
    fireEvent.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenLastCalledWith(["Alpha"]);
  });

  it("disables the trigger and does not open when disabled", () => {
    render(
      <MultiSelect options={optionsBasic} value={[]} onChange={() => {}} disabled />
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByText("Select All")).toBeNull();
  });
});
