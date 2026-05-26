/**
 * src/page/user/Playback/components/PlaybackHeader.jsx — the Playback page
 * top filter bar. Pure presentational: takes a `state` snapshot + an
 * `actions` handler bag and renders the search input, four Select dropdowns
 * (Location, NVR, Camera, Department), a MultiSelect for camera type, and
 * a DatePickerComponent. The component has no own API calls — everything is
 * propagated through `actions`. We pin the following:
 *
 *   - The search input is two-way bound to `state.searchInputValue` and
 *     forwards keystrokes to `actions.handleSearchChange`.
 *   - When `cameraSearchResults` is non-null AND `searchInputValue` is
 *     non-empty AND `isLoading` is false, the dropdown panel renders one
 *     row per result; clicking a row calls
 *     `actions.handleSelectSearchResult(camera, selectedCamera)`.
 *   - With an empty `cameraSearchResults` array (still non-null) and a
 *     non-empty input, the "No search results found" empty-state row
 *     renders.
 *   - All four Selects route `value === 'clear'` through their corresponding
 *     `handleXChange('')` clear path, and any other value through
 *     `handleXChange(value)`.
 *   - The MultiSelect for camera-type forwards the new value to
 *     `actions.setSelectedCameraTypes`.
 *   - The DatePicker `onDateChange` triggers
 *     `actions.setDateRange({ start, end })`.
 *
 * Mocks (≤8):
 *   1. `@/components/ui/select` — native <select> swap so onValueChange is
 *      observable via change event.
 *   2. `@/components/ui/input` — passthrough so the controlled input still
 *      receives value + onChange.
 *   3. `@/components/ui/multiselect` — exposes a button that fires
 *      `onChange(['checkin'])` so we can confirm the prop wiring.
 *   4. `@/components/ui/calendar` — DatePickerComponent button triggers
 *      `onDateChange(new Date('2024-01-15'))`.
 *   5. `@/utils/formatDateRange` — deterministic string output.
 *   6. `react-icons/md` — silence the MdOutlineCalendarMonth icon import.
 *   7. `lucide-react` — silence lucide icon imports.
 *   8. `@/assets/Calendar.svg` — vitest doesn't resolve raw svg imports.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, children, disabled }) => (
    <select
      data-testid={`select-${value || "empty"}`}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      <option value="">__placeholder__</option>
      {children}
    </select>
  );
  const SelectTrigger = ({ children }) => <>{children}</>;
  const SelectValue = ({ placeholder }) => <span>{placeholder}</span>;
  const SelectContent = ({ children }) => <>{children}</>;
  const SelectItem = ({ value, children }) => (
    <option value={value}>{children}</option>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

vi.mock("@/components/ui/multiselect", () => ({
  default: ({ onChange, placeholder }) => (
    <button
      type="button"
      data-testid="multiselect"
      onClick={() => onChange?.(["checkin"])}
    >
      {placeholder}
    </button>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  DatePickerComponent: ({ onDateChange, buttonContent }) => (
    <button
      type="button"
      data-testid="date-picker"
      onClick={() => onDateChange?.(new Date("2024-01-15T00:00:00Z"))}
    >
      {buttonContent}
    </button>
  ),
  DateRangePickerComponent: () => <div data-testid="date-range-picker" />,
}));

vi.mock("@/utils/formatDateRange", () => ({
  formatDate: () => "01/15/2024",
  formatDateRange: () => "01/15/2024 - 01/15/2024",
}));

vi.mock("react-icons/md", () => ({
  MdOutlineCalendarMonth: () => <span data-testid="md-cal" />,
}));

vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="lc-chev" />,
  Search: () => <span data-testid="lc-search" />,
  X: () => <span data-testid="lc-x" />,
}));

vi.mock("@/assets/Calendar.svg", () => ({ default: "Calendar.svg" }));

const PlaybackHeader = (
  await import("../../../../../../src/page/user/Playback/components/PlaybackHeader.jsx")
).default;

const baseState = (overrides = {}) => ({
  searchInputValue: "",
  selectedLocation: "",
  selectedNVRId: "",
  selectedCameraId: "",
  selectedDepartment: "",
  selectedCamera: null,
  selectedCameraTypes: [],
  cameraSearchResults: null,
  isLoading: false,
  locations: [
    { value: "loc-1", label: "Hyderabad" },
    { value: "loc-2", label: "Bengaluru" },
  ],
  nvrOptions: [
    { value: "nvr-1", label: "NVR Alpha" },
  ],
  cameraOptions: [
    { value: "cam-1", label: "Cam One" },
  ],
  departments: [
    { value: "dept-1", label: "Security" },
  ],
  dateRange: { start: null, end: null },
  ...overrides,
});

const baseActions = () => ({
  handleSearchChange: vi.fn(),
  handleSelectSearchResult: vi.fn(),
  setShowSearchResults: vi.fn(),
  handleLocationChange: vi.fn(),
  handleNVRChange: vi.fn(),
  handleCameraChange: vi.fn(),
  handleDepartmentChange: vi.fn(),
  setSelectedCameraTypes: vi.fn(),
  setDateRange: vi.fn(),
});

describe("PlaybackHeader", () => {
  it("renders the title plus the search input, four selects, MultiSelect, and DatePicker", () => {
    render(<PlaybackHeader state={baseState()} actions={baseActions()} />);
    expect(screen.getByText("CCTV Playbacks")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search cameras")).toBeInTheDocument();
    // 4 dropdowns rendered via mocked native <select>
    expect(screen.getByText("Select Location")).toBeInTheDocument();
    expect(screen.getByText("Select NVR")).toBeInTheDocument();
    expect(screen.getByText("Select Camera")).toBeInTheDocument();
    expect(screen.getByText("Select Department")).toBeInTheDocument();
    // MultiSelect button is rendered with its placeholder label
    expect(screen.getByTestId("multiselect")).toHaveTextContent(
      "Select Camera Type"
    );
    // DatePicker is rendered
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  it("forwards keystrokes from the search input via handleSearchChange", () => {
    const actions = baseActions();
    render(<PlaybackHeader state={baseState()} actions={actions} />);
    fireEvent.change(screen.getByPlaceholderText("Search cameras"), {
      target: { value: "alpha" },
    });
    expect(actions.handleSearchChange).toHaveBeenCalledTimes(1);
  });

  it("renders the search-results dropdown when results + non-empty input + not loading", () => {
    const state = baseState({
      searchInputValue: "cam",
      cameraSearchResults: [
        { id: "c1", customName: "Camera Alpha" },
        { id: "c2", name: "Camera Beta" },
      ],
    });
    const actions = baseActions();
    render(<PlaybackHeader state={state} actions={actions} />);
    expect(screen.getByText("Camera Alpha")).toBeInTheDocument();
    expect(screen.getByText("Camera Beta")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Camera Beta"));
    expect(actions.handleSelectSearchResult).toHaveBeenCalledWith(
      { id: "c2", name: "Camera Beta" },
      state.selectedCamera
    );
  });

  it("renders the empty 'No search results found' row when results is an empty array + non-empty input", () => {
    const state = baseState({
      searchInputValue: "xyz",
      cameraSearchResults: [],
    });
    render(<PlaybackHeader state={state} actions={baseActions()} />);
    expect(screen.getByText("No search results found")).toBeInTheDocument();
  });

  it("routes a 'clear' option through handleLocationChange('') and a real value through handleLocationChange(value)", () => {
    const actions = baseActions();
    const state = baseState({ selectedLocation: "loc-1" });
    render(<PlaybackHeader state={state} actions={actions} />);
    // Find the Location native select via its "Select Location" placeholder.
    const locationSelect = screen.getByText("Select Location").closest("select");
    fireEvent.change(locationSelect, { target: { value: "clear" } });
    expect(actions.handleLocationChange).toHaveBeenLastCalledWith("");
    fireEvent.change(locationSelect, { target: { value: "loc-2" } });
    expect(actions.handleLocationChange).toHaveBeenLastCalledWith("loc-2");
  });

  it("wires the NVR / Camera / Department selects through their respective handlers", () => {
    const actions = baseActions();
    const state = baseState({
      selectedNVRId: "nvr-1",
      selectedCameraId: "cam-1",
      selectedDepartment: "dept-1",
    });
    render(<PlaybackHeader state={state} actions={actions} />);
    const nvrSelect = screen.getByText("Select NVR").closest("select");
    const cameraSelect = screen.getByText("Select Camera").closest("select");
    const deptSelect = screen.getByText("Select Department").closest("select");

    fireEvent.change(nvrSelect, { target: { value: "nvr-1" } });
    expect(actions.handleNVRChange).toHaveBeenLastCalledWith("nvr-1");
    fireEvent.change(nvrSelect, { target: { value: "clear" } });
    expect(actions.handleNVRChange).toHaveBeenLastCalledWith("");

    fireEvent.change(cameraSelect, { target: { value: "cam-1" } });
    expect(actions.handleCameraChange).toHaveBeenLastCalledWith("cam-1");
    fireEvent.change(cameraSelect, { target: { value: "clear" } });
    expect(actions.handleCameraChange).toHaveBeenLastCalledWith("");

    fireEvent.change(deptSelect, { target: { value: "dept-1" } });
    expect(actions.handleDepartmentChange).toHaveBeenLastCalledWith("dept-1");
    fireEvent.change(deptSelect, { target: { value: "clear" } });
    expect(actions.handleDepartmentChange).toHaveBeenLastCalledWith("");
  });

  it("forwards camera-type changes through setSelectedCameraTypes and date picks through setDateRange", () => {
    const actions = baseActions();
    render(<PlaybackHeader state={baseState()} actions={actions} />);
    fireEvent.click(screen.getByTestId("multiselect"));
    expect(actions.setSelectedCameraTypes).toHaveBeenCalledWith(["checkin"]);
    fireEvent.click(screen.getByTestId("date-picker"));
    expect(actions.setDateRange).toHaveBeenCalledTimes(1);
    const arg = actions.setDateRange.mock.calls[0][0];
    expect(arg.start).toBeInstanceOf(Date);
    expect(arg.end).toBeInstanceOf(Date);
    // Same date object passed to both start and end.
    expect(arg.start).toBe(arg.end);
  });
});
