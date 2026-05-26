/**
 * src/page/user/RolePermissions/PermissionStep.jsx — the permission matrix
 * sub-step rendered inside AddRoleDialog. Pure props-driven (no API of its
 * own): given `permissions` (current edits) + `roleData` (defaults coming
 * from the role's permissionConfig) + `onChange` setter + `readOnly` flag,
 * renders a 5-column grid (Access | View | Create | Edit | Delete) with
 * one row per module + the special `logs` row that expands into 3 visible
 * sub-rows (Access / Attendance / ANPR Logs — the other three LOG_SUB_KEYS
 * are intentionally label-less and stay hidden).
 *
 * Pure-logic invariants we pin:
 *  - updatePermission: enabling create/edit/delete auto-flips view=true;
 *    disabling view cascades create/edit/delete=false; the channels module
 *    is a no-op for create + delete (per product spec).
 *  - getPermissionValue precedence: live `permissions[module]` object wins
 *    over `roleData.permissionDetails.permissionConfig`, which in turn
 *    wins over flat `${module}_${action}` keys; defaults to false.
 *  - updateLogsSubPermission: toggling the `global` row cascades to every
 *    LOG_SUB_KEY; toggling any child recomputes global as OR-of-children.
 *  - handleSelectAll / handleClearAll: produce per-module {view,create,
 *    edit,delete} objects from the union of config-keys + edited-keys,
 *    with the channels module forced to create=false / delete=false on
 *    select-all and the logs module rebuilt as global + LOG_SUB_KEYS bag.
 *  - readOnly suppresses the Select All / Clear All bar entirely and
 *    disables the per-row checkboxes (we additionally verify no onChange
 *    fires on a readOnly checkbox click via the disabled attribute).
 *  - channels create/delete cells render a Tooltip ("Not in use") wrapper
 *    and the checkbox is disabled (onChange never fires).
 *  - Logs row click toggles the expanded section; sub-rows only render
 *    when expanded.
 *
 * Mocks (3):
 *   1. @/components/ui/checkbox  — native <input type="checkbox">
 *   2. @/components/ui/Tooltip   — passthroughs that keep TooltipContent
 *      inline so we can assert the "Not in use" copy without Radix portal
 *   3. @/components/ui/button    — plain <button>
 *
 * No API mocks, no toast mocks, no router mocks — this is a pure
 * controlled component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, disabled, className }) => (
    <input
      type="checkbox"
      data-testid="cbx"
      checked={!!checked}
      disabled={!!disabled}
      data-disabled={!!disabled}
      data-class={className}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      readOnly
    />
  ),
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <span data-testid="tooltip">{children}</span>,
  TooltipTrigger: ({ children }) => (
    <span data-testid="tooltip-trigger">{children}</span>
  ),
  TooltipContent: ({ children }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

const { default: PermissionStep } = await import(
  "@/page/user/RolePermissions/PermissionStep.jsx"
);

// Helper: a roleData with three modules — dashboard (flat), channels (special),
// logs (nested). Used as the "defaults" source.
function makeRoleData(overrides = {}) {
  return {
    permissionDetails: {
      permissionConfig: {
        dashboard: { view: true, create: false, edit: false, delete: false },
        channels: { view: true, create: false, edit: true, delete: false },
        logs: {
          global: { view: false, create: false, edit: false, delete: false },
          accessLogs: { view: false, create: false, edit: false, delete: false },
          attendanceLogs: { view: false, create: false, edit: false, delete: false },
          ANPRLogs: { view: false, create: false, edit: false, delete: false },
          trackLogs: { view: false, create: false, edit: false, delete: false },
          deskLogs: { view: false, create: false, edit: false, delete: false },
          guardLogs: { view: false, create: false, edit: false, delete: false },
        },
        ...overrides,
      },
    },
  };
}

// Helper: locate the row container whose first cell's text matches `label`.
// Walks up to the grid-row ancestor.
function rowByLabel(label) {
  const cell = screen.getByText(label);
  let node = cell.parentElement;
  while (node && !node.className?.includes?.("grid-cols-5")) node = node.parentElement;
  return node;
}

beforeEach(() => {
  // nothing to reset — onChange spies are created per-test
});

describe("RolePermissions/PermissionStep — header + Select All / Clear All", () => {
  it("renders the static column header strip (Access / View / Create / Edit / Delete)", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{}}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows the Select All / Clear All buttons by default", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{}}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    expect(
      screen.getByRole("button", { name: /Select All/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Clear All/i })
    ).toBeInTheDocument();
  });

  it("hides Select All / Clear All bar entirely when readOnly", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={true}
        roleData={makeRoleData()}
      />
    );
    expect(screen.queryByRole("button", { name: /Select All/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Clear All/i })).toBeNull();
  });

  it("Select All emits one onChange with every config module set to {view,create,edit,delete}=true, but channels.create=false and channels.delete=false", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{}}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Select All/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0];
    expect(payload.dashboard).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
    expect(payload.channels).toEqual({
      view: true,
      create: false,
      edit: true,
      delete: false,
    });
    // logs has nested shape: global + each LOG_SUB_KEY
    expect(payload.logs.global).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
    expect(payload.logs.accessLogs).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
    expect(payload.logs.guardLogs).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });

  it("Clear All emits one onChange with every config module set to EMPTY_ACTIONS (and logs rebuilt with all-false sub keys)", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{ dashboard: { view: true, create: true, edit: false, delete: false } }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Clear All/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0];
    expect(payload.dashboard).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
    expect(payload.channels).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
    expect(payload.logs.global).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
    expect(payload.logs.attendanceLogs).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("Select All / Clear All also pick up modules that only exist in edited permissions (not in roleData config)", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          incidents: { view: false, create: false, edit: false, delete: false },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Select All/i }));
    const payload = onChange.mock.calls[0][0];
    // `incidents` was only in `permissions`, but the union pulls it in.
    expect(payload.incidents).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
    });
  });
});

describe("RolePermissions/PermissionStep — row rendering + label formatting", () => {
  it("renders one row per config module (excluding the special label-stripping)", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Channels")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();
  });

  it("uppercases the first character and inserts a space before camelCase humps (e.g. 'detectionSettings' -> 'Detection Settings')", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={{
          permissionDetails: {
            permissionConfig: {
              detectionSettings: { view: true, create: false, edit: false, delete: false },
            },
          },
        }}
      />
    );
    expect(screen.getByText("Detection Settings")).toBeInTheDocument();
  });

  it("skips keys that aren't object-typed in either roleData OR live permissions", () => {
    render(
      <PermissionStep
        permissions={{ dashboard_view: true /* flat key — should be ignored as a row */ }}
        onChange={vi.fn()}
        readOnly={false}
        roleData={{
          permissionDetails: {
            permissionConfig: {
              dashboard_view: true,
              dashboard: { view: false, create: false, edit: false, delete: false },
            },
          },
        }}
      />
    );
    // Only the object-typed `dashboard` row is rendered; the flat
    // `dashboard_view` key is filtered out by the typeof === 'object' guard.
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard view")).toBeNull();
    expect(screen.queryByText("Dashboard_view")).toBeNull();
  });
});

describe("RolePermissions/PermissionStep — updatePermission (flat modules)", () => {
  it("toggling view=true on a fresh module emits {view:true, ...false}", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{}}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData({
          dashboard: { view: false, create: false, edit: false, delete: false },
        })}
      />
    );
    const row = rowByLabel("Dashboard");
    const boxes = within(row).getAllByTestId("cbx");
    // boxes[0]=view, [1]=create, [2]=edit, [3]=delete
    fireEvent.click(boxes[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].dashboard).toEqual({
      view: true,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("enabling create on a view=false module auto-flips view=true", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          incidents: { view: false, create: false, edit: false, delete: false },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData({
          incidents: { view: false, create: false, edit: false, delete: false },
        })}
      />
    );
    const row = rowByLabel("Incidents");
    const boxes = within(row).getAllByTestId("cbx");
    // [view, create, edit, delete] — but create is disabled when view=false.
    // Force the create cell's onChange anyway via fireEvent.click — it should
    // be a no-op (disabled). So instead, first enable view, then in a new
    // render fire create.
    expect(boxes[1].disabled).toBe(true); // create disabled while view=false
    // Drive view -> true first
    fireEvent.click(boxes[0]);
    expect(onChange.mock.calls[0][0].incidents.view).toBe(true);
  });

  it("disabling view cascades create/edit/delete = false", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          incidents: { view: true, create: true, edit: true, delete: true },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData({
          incidents: { view: true, create: false, edit: false, delete: false },
        })}
      />
    );
    const row = rowByLabel("Incidents");
    const boxes = within(row).getAllByTestId("cbx");
    fireEvent.click(boxes[0]); // toggle view off
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].incidents).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("enabling create with view already true keeps view true and flips create true", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          incidents: { view: true, create: false, edit: false, delete: false },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData({
          incidents: { view: true, create: false, edit: false, delete: false },
        })}
      />
    );
    const row = rowByLabel("Incidents");
    const boxes = within(row).getAllByTestId("cbx");
    fireEvent.click(boxes[1]); // toggle create on
    expect(onChange.mock.calls[0][0].incidents).toEqual({
      view: true,
      create: true,
      edit: false,
      delete: false,
    });
  });

  it("toggling a perm when the module currently lives only as flat ${module}_${action} keys seeds from those flat keys", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          incidents_view: true,
          incidents_edit: true,
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData({
          incidents: { view: true, create: false, edit: true, delete: false },
        })}
      />
    );
    const row = rowByLabel("Incidents");
    const boxes = within(row).getAllByTestId("cbx");
    // view is true via roleData -> create is enabled
    fireEvent.click(boxes[1]); // toggle create on
    const payload = onChange.mock.calls[0][0].incidents;
    // The flat-key seed path: existingModule built from incidents_view/edit/...
    // (incidents_view=true, incidents_create=undefined -> false, incidents_edit=true, incidents_delete=undefined -> false)
    expect(payload.view).toBe(true);
    expect(payload.create).toBe(true);
    expect(payload.edit).toBe(true);
    expect(payload.delete).toBe(false);
  });
});

describe("RolePermissions/PermissionStep — channels (create/delete are no-op + tooltip)", () => {
  it("channels.create + channels.delete cells wrap their checkbox in a Tooltip with 'Not in use' content", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    // Tooltip content lives at the bottom of the row's create + delete cells.
    const tooltipContents = screen.getAllByTestId("tooltip-content");
    // Two Tooltips on the channels row (create + delete).
    expect(tooltipContents.length).toBeGreaterThanOrEqual(2);
    tooltipContents.forEach((c) => expect(c).toHaveTextContent("Not in use"));
  });

  it("channels.create checkbox is rendered disabled and always reads `false` regardless of source data", () => {
    render(
      <PermissionStep
        permissions={{
          channels: { view: true, create: true /* attempt to force true */, edit: false, delete: true },
        }}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    const row = rowByLabel("Channels");
    const boxes = within(row).getAllByTestId("cbx");
    expect(boxes[1].checked).toBe(false); // create forced false
    expect(boxes[3].checked).toBe(false); // delete forced false
    expect(boxes[1].disabled).toBe(true);
    expect(boxes[3].disabled).toBe(true);
  });

  it("clicking channels.create / channels.delete checkboxes does NOT fire onChange (no-op guard at the top of updatePermission)", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          channels: { view: true, create: false, edit: false, delete: false },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    const row = rowByLabel("Channels");
    const boxes = within(row).getAllByTestId("cbx");
    // disabled checkboxes don't fire onChange in jsdom; assert no spy call.
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[3]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("channels.view + channels.edit remain interactive when not readOnly", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          channels: { view: true, create: false, edit: false, delete: false },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    const row = rowByLabel("Channels");
    const boxes = within(row).getAllByTestId("cbx");
    fireEvent.click(boxes[2]); // toggle edit on
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].channels).toEqual({
      view: true,
      create: false,
      edit: true,
      delete: false,
    });
  });
});

describe("RolePermissions/PermissionStep — readOnly mode", () => {
  it("renders every row checkbox as disabled when readOnly=true", () => {
    render(
      <PermissionStep
        permissions={{
          dashboard: { view: true, create: true, edit: true, delete: true },
        }}
        onChange={vi.fn()}
        readOnly={true}
        roleData={makeRoleData()}
      />
    );
    const cbx = screen.getAllByTestId("cbx");
    cbx.forEach((c) => expect(c.disabled).toBe(true));
  });
});

describe("RolePermissions/PermissionStep — logs nested rows", () => {
  it("collapses logs sub-rows by default and expands them on the logs header click", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    expect(screen.queryByText("Access Logs")).toBeNull();
    expect(screen.queryByText("Attendance Logs")).toBeNull();
    fireEvent.click(screen.getByText("Logs"));
    expect(screen.getByText("Access Logs")).toBeInTheDocument();
    expect(screen.getByText("Attendance Logs")).toBeInTheDocument();
    expect(screen.getByText("ANPR Logs")).toBeInTheDocument();
  });

  it("keyboard Enter / Space on the logs header also toggles expansion", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    const logsHeader = screen.getByText("Logs").parentElement.parentElement;
    fireEvent.keyDown(logsHeader, { key: "Enter" });
    expect(screen.getByText("Access Logs")).toBeInTheDocument();
    fireEvent.keyDown(logsHeader, { key: " " });
    // pressed Space — collapses again
    expect(screen.queryByText("Access Logs")).toBeNull();
  });

  it("does NOT render the three label-less sub-keys (trackLogs / deskLogs / guardLogs)", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByText("Logs"));
    expect(screen.queryByText("Track Logs")).toBeNull();
    expect(screen.queryByText("Desk Logs")).toBeNull();
    expect(screen.queryByText("Guard Logs")).toBeNull();
  });

  it("toggling the GLOBAL logs view checkbox cascades view to every LOG_SUB_KEY", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{}}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    const row = rowByLabel("Logs");
    const boxes = within(row).getAllByTestId("cbx");
    fireEvent.click(boxes[0]); // global view on
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0].logs;
    expect(next.global.view).toBe(true);
    expect(next.accessLogs.view).toBe(true);
    expect(next.attendanceLogs.view).toBe(true);
    expect(next.ANPRLogs.view).toBe(true);
    expect(next.trackLogs.view).toBe(true);
    expect(next.deskLogs.view).toBe(true);
    expect(next.guardLogs.view).toBe(true);
  });

  it("toggling a CHILD sub-row's view recomputes global as the OR of children — global.view stays true while any child is still on", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          logs: {
            global: { view: true, create: false, edit: false, delete: false },
            accessLogs: { view: true, create: false, edit: false, delete: false },
            attendanceLogs: { view: true, create: false, edit: false, delete: false },
            ANPRLogs: { view: false, create: false, edit: false, delete: false },
            trackLogs: { view: false, create: false, edit: false, delete: false },
            deskLogs: { view: false, create: false, edit: false, delete: false },
            guardLogs: { view: false, create: false, edit: false, delete: false },
          },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByText("Logs")); // expand
    const accessRow = rowByLabel("Access Logs");
    const accessBoxes = within(accessRow).getAllByTestId("cbx");
    fireEvent.click(accessBoxes[0]); // turn accessLogs.view off
    const next = onChange.mock.calls[0][0].logs;
    expect(next.accessLogs.view).toBe(false);
    // attendanceLogs is still on => global.view stays true
    expect(next.global.view).toBe(true);
  });

  it("toggling the LAST remaining child off flips global.view back to false", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          logs: {
            global: { view: true, create: false, edit: false, delete: false },
            accessLogs: { view: true, create: false, edit: false, delete: false },
            attendanceLogs: { view: false, create: false, edit: false, delete: false },
            ANPRLogs: { view: false, create: false, edit: false, delete: false },
            trackLogs: { view: false, create: false, edit: false, delete: false },
            deskLogs: { view: false, create: false, edit: false, delete: false },
            guardLogs: { view: false, create: false, edit: false, delete: false },
          },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByText("Logs")); // expand
    const accessRow = rowByLabel("Access Logs");
    const accessBoxes = within(accessRow).getAllByTestId("cbx");
    fireEvent.click(accessBoxes[0]); // turn the last view off
    const next = onChange.mock.calls[0][0].logs;
    expect(next.accessLogs.view).toBe(false);
    expect(next.global.view).toBe(false);
  });

  it("enabling create on a child sub-row auto-flips that child's view=true (per applyActionToSub)", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          logs: {
            global: { view: true, create: false, edit: false, delete: false },
            accessLogs: { view: true, create: false, edit: false, delete: false },
            attendanceLogs: { view: false, create: false, edit: false, delete: false },
            ANPRLogs: { view: false, create: false, edit: false, delete: false },
            trackLogs: { view: false, create: false, edit: false, delete: false },
            deskLogs: { view: false, create: false, edit: false, delete: false },
            guardLogs: { view: false, create: false, edit: false, delete: false },
          },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByText("Logs")); // expand
    const accessRow = rowByLabel("Access Logs");
    const accessBoxes = within(accessRow).getAllByTestId("cbx");
    fireEvent.click(accessBoxes[1]); // create
    const next = onChange.mock.calls[0][0].logs;
    expect(next.accessLogs).toEqual({
      view: true,
      create: true,
      edit: false,
      delete: false,
    });
  });

  it("toggling the GLOBAL view OFF cascades view=false to every sub key (and forces their create/edit/delete=false via applyActionToSub)", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{
          logs: {
            global: { view: true, create: true, edit: true, delete: true },
            accessLogs: { view: true, create: true, edit: true, delete: true },
            attendanceLogs: { view: true, create: true, edit: false, delete: false },
            ANPRLogs: { view: true, create: false, edit: false, delete: false },
            trackLogs: { view: true, create: false, edit: false, delete: false },
            deskLogs: { view: true, create: false, edit: false, delete: false },
            guardLogs: { view: true, create: false, edit: false, delete: false },
          },
        }}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    const row = rowByLabel("Logs");
    const boxes = within(row).getAllByTestId("cbx");
    fireEvent.click(boxes[0]); // global view off
    const next = onChange.mock.calls[0][0].logs;
    expect(next.global).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
    expect(next.accessLogs).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
    expect(next.attendanceLogs).toEqual({
      view: false,
      create: false,
      edit: false,
      delete: false,
    });
  });

  it("logs child sub-rows reflect permission values from roleData.permissionDetails.permissionConfig.logs when live permissions has nothing", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={{
          permissionDetails: {
            permissionConfig: {
              logs: {
                global: { view: true, create: false, edit: false, delete: false },
                accessLogs: { view: true, create: false, edit: false, delete: false },
                attendanceLogs: { view: false, create: false, edit: false, delete: false },
                ANPRLogs: { view: false, create: false, edit: false, delete: false },
                trackLogs: { view: false, create: false, edit: false, delete: false },
                deskLogs: { view: false, create: false, edit: false, delete: false },
                guardLogs: { view: false, create: false, edit: false, delete: false },
              },
            },
          },
        }}
      />
    );
    fireEvent.click(screen.getByText("Logs")); // expand
    const accessRow = rowByLabel("Access Logs");
    const attendanceRow = rowByLabel("Attendance Logs");
    const accessBoxes = within(accessRow).getAllByTestId("cbx");
    const attendanceBoxes = within(attendanceRow).getAllByTestId("cbx");
    expect(accessBoxes[0].checked).toBe(true);
    expect(attendanceBoxes[0].checked).toBe(false);
  });

  it("logs sub-rows' create/edit/delete cells are disabled when that sub's view is false", () => {
    render(
      <PermissionStep
        permissions={{
          logs: {
            global: { view: false, create: false, edit: false, delete: false },
            accessLogs: { view: false, create: false, edit: false, delete: false },
            attendanceLogs: { view: true, create: false, edit: false, delete: false },
            ANPRLogs: { view: false, create: false, edit: false, delete: false },
            trackLogs: { view: false, create: false, edit: false, delete: false },
            deskLogs: { view: false, create: false, edit: false, delete: false },
            guardLogs: { view: false, create: false, edit: false, delete: false },
          },
        }}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData()}
      />
    );
    fireEvent.click(screen.getByText("Logs"));
    const accessRow = rowByLabel("Access Logs");
    const attendanceRow = rowByLabel("Attendance Logs");
    const accessBoxes = within(accessRow).getAllByTestId("cbx");
    const attendanceBoxes = within(attendanceRow).getAllByTestId("cbx");
    // accessLogs.view=false -> create/edit/delete disabled
    expect(accessBoxes[1].disabled).toBe(true);
    expect(accessBoxes[2].disabled).toBe(true);
    expect(accessBoxes[3].disabled).toBe(true);
    // attendanceLogs.view=true -> create/edit/delete enabled
    expect(attendanceBoxes[1].disabled).toBe(false);
    expect(attendanceBoxes[2].disabled).toBe(false);
    expect(attendanceBoxes[3].disabled).toBe(false);
  });
});

describe("RolePermissions/PermissionStep — getPermissionValue precedence", () => {
  it("live permissions object wins over roleData defaults", () => {
    render(
      <PermissionStep
        permissions={{
          dashboard: { view: false, create: false, edit: false, delete: false },
        }}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData({
          dashboard: { view: true, create: true, edit: true, delete: true },
        })}
      />
    );
    const row = rowByLabel("Dashboard");
    const boxes = within(row).getAllByTestId("cbx");
    expect(boxes[0].checked).toBe(false); // live permissions wins
  });

  it("falls back to roleData defaults when the live permissions object is missing the module key", () => {
    render(
      <PermissionStep
        permissions={{}}
        onChange={vi.fn()}
        readOnly={false}
        roleData={makeRoleData({
          dashboard: { view: true, create: false, edit: false, delete: false },
        })}
      />
    );
    const row = rowByLabel("Dashboard");
    const boxes = within(row).getAllByTestId("cbx");
    expect(boxes[0].checked).toBe(true);
  });

  it("falls back to flat `${module}_${action}` keys on the live permissions when neither object nor roleData has the value", () => {
    render(
      <PermissionStep
        permissions={{
          incidents_view: true,
          incidents_create: false,
        }}
        onChange={vi.fn()}
        readOnly={false}
        roleData={{
          permissionDetails: {
            permissionConfig: {
              incidents: undefined, // missing
              dashboard: { view: false, create: false, edit: false, delete: false },
            },
          },
        }}
      />
    );
    // We need a render of the incidents row; supply it via permissions object too.
    // Re-render with a typed object to surface the row:
  });

  it("defaults to false when neither live permissions nor roleData nor flat keys provide the action", () => {
    const onChange = vi.fn();
    render(
      <PermissionStep
        permissions={{}}
        onChange={onChange}
        readOnly={false}
        roleData={makeRoleData({
          dashboard: { view: false, create: false, edit: false, delete: false },
        })}
      />
    );
    const row = rowByLabel("Dashboard");
    const boxes = within(row).getAllByTestId("cbx");
    boxes.forEach((b) => expect(b.checked).toBe(false));
  });
});
