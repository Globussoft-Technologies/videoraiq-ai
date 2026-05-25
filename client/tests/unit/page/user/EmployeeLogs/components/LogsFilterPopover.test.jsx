/**
 * src/page/user/EmployeeLogs/components/LogsFilterPopover.jsx — the
 * Filters popover for EmployeeLogs that bundles NVR / Camera /
 * Department / (optional) Location multi-selects, an optional
 * time-range pair (UnifiedTimePicker x 2 + Reset Time), and an
 * optional Authorized-User-Only switch.
 *
 * The component is mostly presentational glue: it derives an
 * `activeFiltersCount` from the seven props, maps {_id|id, nvrName}
 * and {_id|id, customName|name} into MultiSelect option shapes,
 * and forwards UnifiedTimePicker callbacks through parseTime /
 * formatTime (timeUtils.js, exercised by its own spec).
 *
 * Mocks (5, all leaves under @/components/ui or sibling):
 *   1. @/components/ui/popover    - render trigger + content inline.
 *   2. @/components/ui/switch     - render as a checkbox.
 *   3. @/components/ui/multiselect- record options/value/placeholder
 *                                   and expose a select-all button.
 *   4. ./TimePickerComponents     - record the hour/minute/period
 *                                   so we can fire a handleFromTimeChange.
 *   5. @/components/ui/button     - left REAL (no mock); pulls cn +
 *                                   class-variance-authority only.
 * Well under the 8-mock cap.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ id, checked, onCheckedChange }) => (
    <input
      type="checkbox"
      id={id}
      data-testid="authorized-switch"
      checked={!!checked}
      onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
    />
  ),
}));

// MultiSelect is mocked as a stub that records its props on a global
// counter and exposes a button that invokes onChange with the first
// option. This lets us assert option shape + change wiring without
// fighting the real component's portal/keyboard logic.
vi.mock("@/components/ui/multiselect", () => ({
  __esModule: true,
  default: ({ options = [], value = [], onChange, placeholder, msg }) => (
    <div
      data-testid={`ms-${placeholder.replace(/\s+/g, "-").toLowerCase()}`}
      data-options={JSON.stringify(options)}
      data-value={JSON.stringify(value)}
      data-msg={msg || ""}
    >
      <span>{placeholder}</span>
      <button
        type="button"
        data-testid={`pick-${placeholder.replace(/\s+/g, "-").toLowerCase()}`}
        onClick={() => onChange && onChange(options.map((o) => o.id))}
      >
        select-all
      </button>
    </div>
  ),
}));

vi.mock(
  "../../../../../../src/page/user/EmployeeLogs/components/TimePickerComponents.jsx",
  () => ({
    UnifiedTimePicker: ({ hour, minute, period, onChange }) => (
      <div data-testid={`time-picker-${hour || "x"}-${minute || "x"}-${period || "x"}`}>
        <button
          type="button"
          data-testid={`tp-hour-${hour || "x"}`}
          onClick={() => onChange && onChange("hour", "05")}
        >
          set-hour-05
        </button>
        <button
          type="button"
          data-testid={`tp-minute-${minute || "x"}`}
          onClick={() => onChange && onChange("minute", "30")}
        >
          set-minute-30
        </button>
      </div>
    ),
  })
);

const { default: LogsFilterPopover } = await import(
  "../../../../../../src/page/user/EmployeeLogs/components/LogsFilterPopover.jsx"
);

const baseProps = (over = {}) => ({
  nvrIds: [],
  setNvrId: vi.fn(),
  nvrList: [],
  cameraId: [],
  setCameraId: vi.fn(),
  cameraList: [],
  departments: [],
  selectedDepartments: [],
  setSelectedDepartments: vi.fn(),
  showTimeRange: false,
  setTimeType: vi.fn(),
  setFromTime: vi.fn(),
  setToTime: vi.fn(),
  fromTime: "",
  toTime: "",
  showUnknownFilter: false,
  removeUnknown: false,
  setRemoveUnknown: vi.fn(),
  timeType: "",
  showLocationFilter: false,
  employeeLocations: [],
  setEmployeeLocations: vi.fn(),
  locationOptions: [],
  ...over,
});

describe("EmployeeLogs/LogsFilterPopover", () => {
  it("renders the Filters trigger button and three default multi-selects (NVR / Camera / Department)", () => {
    render(<LogsFilterPopover {...baseProps()} />);
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("Additional Filters")).toBeInTheDocument();
    expect(screen.getByTestId("ms-select-nvr")).toBeInTheDocument();
    expect(screen.getByTestId("ms-select-camera")).toBeInTheDocument();
    expect(screen.getByTestId("ms-select-department")).toBeInTheDocument();
    // Location, time, switch are all opt-in.
    expect(screen.queryByTestId("ms-select-location")).toBeNull();
    expect(screen.queryByText("Time Frame")).toBeNull();
    expect(screen.queryByTestId("authorized-switch")).toBeNull();
  });

  it("does not render an active-filter badge when no filters are active", () => {
    render(<LogsFilterPopover {...baseProps()} />);
    // Badge has the literal "Filters" label as a sibling; the badge
    // itself is a span whose className contains "bg-[#005480]".
    const trigger = screen.getByText("Filters").closest("button");
    expect(trigger).not.toBeNull();
    expect(trigger.querySelector("span.bg-\\[\\#005480\\]")).toBeNull();
  });

  it("counts active filters: nvrIds + cameraId + departments + location + fromTime + toTime + Authorized switch = 7", () => {
    render(
      <LogsFilterPopover
        {...baseProps({
          nvrIds: ["n1"],
          cameraId: ["c1"],
          selectedDepartments: ["d1"],
          fromTime: "08:00 AM",
          toTime: "05:00 PM",
          showUnknownFilter: true,
          removeUnknown: true,
          showLocationFilter: true,
          employeeLocations: ["l1"],
        })}
      />
    );
    const trigger = screen.getByText("Filters").closest("button");
    const badge = trigger.querySelector("span.bg-\\[\\#005480\\]");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("7");
  });

  it("maps nvrList -> { label: nvrName, id: _id || id } and cameraList -> { label: customName || name, id: id || _id }", () => {
    render(
      <LogsFilterPopover
        {...baseProps({
          nvrList: [
            { _id: "n1", nvrName: "Front NVR" },
            { id: "n2", nvrName: "Back NVR" },
          ],
          cameraList: [
            { _id: "c1", customName: "Entrance", name: "raw-1" },
            { id: "c2", name: "Loading Bay" },
          ],
        })}
      />
    );
    const nvrOpts = JSON.parse(
      screen.getByTestId("ms-select-nvr").getAttribute("data-options")
    );
    expect(nvrOpts).toEqual([
      { label: "Front NVR", id: "n1" },
      { label: "Back NVR", id: "n2" },
    ]);
    const camOpts = JSON.parse(
      screen.getByTestId("ms-select-camera").getAttribute("data-options")
    );
    expect(camOpts).toEqual([
      { label: "Entrance", id: "c1" },
      { label: "Loading Bay", id: "c2" },
    ]);
  });

  it("forwards the picker's select-all callback to setNvrId / setCameraId / setSelectedDepartments", () => {
    const p = baseProps({
      nvrList: [{ _id: "n1", nvrName: "Front" }],
      cameraList: [{ _id: "c1", name: "Entrance" }],
      departments: [{ id: "d1", label: "Sec" }],
    });
    render(<LogsFilterPopover {...p} />);
    fireEvent.click(screen.getByTestId("pick-select-nvr"));
    expect(p.setNvrId).toHaveBeenCalledWith(["n1"]);
    fireEvent.click(screen.getByTestId("pick-select-camera"));
    expect(p.setCameraId).toHaveBeenCalledWith(["c1"]);
    fireEvent.click(screen.getByTestId("pick-select-department"));
    expect(p.setSelectedDepartments).toHaveBeenCalledWith(["d1"]);
  });

  it("renders the location multi-select only when showLocationFilter is true, with the custom 'No Location Found' msg", () => {
    const { rerender } = render(<LogsFilterPopover {...baseProps()} />);
    expect(screen.queryByTestId("ms-select-location")).toBeNull();
    rerender(
      <LogsFilterPopover
        {...baseProps({
          showLocationFilter: true,
          locationOptions: [{ id: "l1", label: "HQ" }],
        })}
      />
    );
    const loc = screen.getByTestId("ms-select-location");
    expect(loc).toBeInTheDocument();
    expect(loc.getAttribute("data-msg")).toBe("No Location Found");
  });

  it("renders the time-range pair only when showTimeRange is true and parses fromTime / toTime into UnifiedTimePicker parts", () => {
    render(
      <LogsFilterPopover
        {...baseProps({ showTimeRange: true, fromTime: "08:15 AM", toTime: "05:45 PM" })}
      />
    );
    expect(screen.getByText("Time Frame")).toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    // parseTime("08:15 AM") -> hour=08, minute=15, period=AM
    expect(screen.getByTestId("time-picker-08-15-AM")).toBeInTheDocument();
    // parseTime("05:45 PM") -> hour=05, minute=45, period=PM
    expect(screen.getByTestId("time-picker-05-45-PM")).toBeInTheDocument();
  });

  it("handleFromTimeChange and handleToTimeChange call setFromTime / setToTime with the re-formatted string", () => {
    const p = baseProps({
      showTimeRange: true,
      fromTime: "08:15 AM",
      toTime: "05:45 PM",
    });
    render(<LogsFilterPopover {...p} />);
    // From picker "set-hour-05" replaces hour=08 with 05; minute/period stay.
    const fromHourBtn = within(
      screen.getByTestId("time-picker-08-15-AM")
    ).getByTestId("tp-hour-08");
    fireEvent.click(fromHourBtn);
    expect(p.setFromTime).toHaveBeenLastCalledWith("05:15 AM");
    // To picker "set-minute-30" replaces minute=45 with 30; hour/period stay.
    const toMinuteBtn = within(
      screen.getByTestId("time-picker-05-45-PM")
    ).getByTestId("tp-minute-45");
    fireEvent.click(toMinuteBtn);
    expect(p.setToTime).toHaveBeenLastCalledWith("05:30 PM");
  });

  it("Reset Time button clears fromTime / toTime / timeType", () => {
    const p = baseProps({
      showTimeRange: true,
      fromTime: "08:00 AM",
      toTime: "05:00 PM",
    });
    render(<LogsFilterPopover {...p} />);
    fireEvent.click(screen.getByText("Reset Time"));
    expect(p.setFromTime).toHaveBeenCalledWith("");
    expect(p.setToTime).toHaveBeenCalledWith("");
    expect(p.setTimeType).toHaveBeenCalledWith("");
  });

  it("Authorized User Only switch renders only when showUnknownFilter is true and toggles setRemoveUnknown(Boolean)", () => {
    const p = baseProps({ showUnknownFilter: true, removeUnknown: false });
    render(<LogsFilterPopover {...p} />);
    const sw = screen.getByTestId("authorized-switch");
    expect(sw).not.toBeChecked();
    expect(screen.getByText("Authorized User Only")).toBeInTheDocument();
    fireEvent.click(sw);
    expect(p.setRemoveUnknown).toHaveBeenCalledWith(true);
  });
});
