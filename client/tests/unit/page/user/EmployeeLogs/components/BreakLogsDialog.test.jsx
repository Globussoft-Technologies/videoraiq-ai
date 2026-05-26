/**
 * src/page/user/EmployeeLogs/components/BreakLogsDialog.jsx — Radix Dialog
 * that fetches per-employee attendance break logs via getAttendanceUserLogs
 * and renders three branches:
 *   - loading        -> "Loading..." copy
 *   - empty result   -> "No breaks recorded" with empty-state Hourglass
 *   - has entries    -> per-row "Break N" cards with formatted Check out /
 *                       Check in / per-break duration pill + total footer.
 *
 * Helpers under test (indirectly via rendered output):
 *   - msToHms          (hr / min / sec formatting)
 *   - formatBreakDuration (ms diff between checkout / checkin)
 *   - formatTime       (UTC -> moment-timezone formatted "hh:mm:ss A")
 *
 * Mocks (2):
 *   1. ../../../../../../src/page/user/EmployeeLogs/Api/get  — stub
 *      getAttendanceUserLogs so we can drive each branch deterministically.
 *      Sibling exports preserved as no-op spies to keep the module
 *      shape stable for anything else importing from it during this run.
 *   2. sonner                                               — capture toast
 *      so the "no data to export" path doesn't depend on a real toaster.
 *
 * XLSX / jsPDF / jspdf-autotable are NOT exercised here (the export
 * buttons are merely asserted to render/hide); leaving those modules un-
 * mocked keeps the test small and avoids touching DOM-blob APIs jsdom
 * doesn't fully support.
 *
 * The real @/components/ui/dialog (Radix) and moment-timezone are kept —
 * existing LogEmployeeProfileDialog spec already proves Radix Dialog +
 * the DetectionContext import that dialog.jsx pulls in render cleanly
 * under jsdom without any extra setup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const apiRef = vi.hoisted(() => ({
  getAttendanceUserLogs: vi.fn(),
  getAttendanceLogs: vi.fn(),
  getTrackUsers: vi.fn(),
  getTrackLogs: vi.fn(),
  getVehicleList: vi.fn(),
  getVehicleLogs: vi.fn(),
}));
vi.mock(
  "../../../../../../src/page/user/EmployeeLogs/Api/get",
  () => apiRef
);

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const { default: BreakLogsDialog } = await import(
  "../../../../../../src/page/user/EmployeeLogs/components/BreakLogsDialog.jsx"
);

const baseLog = {
  id: "emp-123",
  name: "Jane Doe",
  image: "https://example.test/jane.jpg",
  // login / logout supply the date used to derive the API request date.
  login: "2026-01-15T08:30:00Z",
  logout: "2026-01-15T17:00:00Z",
};

beforeEach(() => {
  apiRef.getAttendanceUserLogs.mockReset();
  toastRef.success.mockReset();
  toastRef.error.mockReset();
});

describe("EmployeeLogs/BreakLogsDialog", () => {
  it("skips fetching when open=false (no API call, no header rendered)", () => {
    render(
      <BreakLogsDialog
        open={false}
        log={baseLog}
        region="UTC"
        canEdit
      />
    );
    expect(apiRef.getAttendanceUserLogs).not.toHaveBeenCalled();
    // Radix Dialog only mounts its content when open — the title shouldn't
    // be queryable in the DOM.
    expect(screen.queryByText("Break Logs")).toBeNull();
  });

  it("skips fetching when log has no id (guard against half-populated rows)", () => {
    render(
      <BreakLogsDialog
        open
        log={{ name: "No-Id" }}
        region="UTC"
        selectedDate="2026-01-15"
        canEdit
      />
    );
    expect(apiRef.getAttendanceUserLogs).not.toHaveBeenCalled();
  });

  it("empty result: renders the 'No breaks recorded' empty state and hides Export PDF", async () => {
    apiRef.getAttendanceUserLogs.mockResolvedValueOnce({
      data: { body: { data: { logs: [] } } },
    });

    render(
      <BreakLogsDialog open log={baseLog} region="UTC" canEdit />
    );

    // Dialog header is always present.
    expect(await screen.findByText("Break Logs")).toBeInTheDocument();
    // Empty state copy appears after the fetch settles.
    await waitFor(() =>
      expect(screen.getByText("No breaks recorded")).toBeInTheDocument()
    );
    // The fetch used the date resolved from log.login (2026-01-15).
    expect(apiRef.getAttendanceUserLogs).toHaveBeenCalledWith(
      "emp-123",
      "2026-01-15"
    );
    // Export PDF button is gated on breakEntries.length > 0.
    expect(screen.queryByText(/Export PDF/i)).toBeNull();
  });

  it("populated result: renders per-break rows with formatted duration pill, header copy and total", async () => {
    // Two breaks back-to-back so the total is the sum of both durations.
    apiRef.getAttendanceUserLogs.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            logs: [
              {
                checkout: { timestamp: "2026-01-15T10:00:00Z" },
                checkin: { timestamp: "2026-01-15T10:15:30Z" }, // 15 min 30 sec
              },
              {
                checkout: { timestamp: "2026-01-15T13:00:00Z" },
                checkin: { timestamp: "2026-01-15T13:05:00Z" }, // 5 min
              },
            ],
          },
        },
      },
    });

    render(
      <BreakLogsDialog open log={baseLog} region="UTC" canEdit />
    );

    // Wait for the cards to mount.
    await waitFor(() =>
      expect(screen.getByText("Break 1")).toBeInTheDocument()
    );
    expect(screen.getByText("Break 2")).toBeInTheDocument();

    // Per-break duration pills (msToHms output).
    expect(screen.getByText("15 min 30 sec")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();

    // Times rendered in the region tz (UTC -> "hh:mm:ss A" 12-hour).
    expect(screen.getByText("10:00:00 AM")).toBeInTheDocument();
    expect(screen.getByText("10:15:30 AM")).toBeInTheDocument();
    expect(screen.getByText("01:00:00 PM")).toBeInTheDocument();
    expect(screen.getByText("01:05:00 PM")).toBeInTheDocument();

    // Footer total: 15m30s + 5m = 20 min 30 sec.
    expect(screen.getByText("20 min 30 sec")).toBeInTheDocument();
    // Pluralised label ("2 breaks").
    expect(screen.getByText(/breaks$/)).toBeInTheDocument();

    // Export PDF is offered when canEdit && entries exist.
    expect(screen.getByText(/Export PDF/i)).toBeInTheDocument();
  });

  it("hides Export PDF when canEdit=false even with entries", async () => {
    apiRef.getAttendanceUserLogs.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            logs: [
              {
                checkout: { timestamp: "2026-01-15T10:00:00Z" },
                checkin: { timestamp: "2026-01-15T10:01:00Z" },
              },
            ],
          },
        },
      },
    });

    render(
      <BreakLogsDialog open log={baseLog} region="UTC" canEdit={false} />
    );

    await waitFor(() =>
      expect(screen.getByText("Break 1")).toBeInTheDocument()
    );
    expect(screen.queryByText(/Export PDF/i)).toBeNull();
  });

  it("invalid break window (checkin <= checkout) renders '--' duration, not a negative time", async () => {
    apiRef.getAttendanceUserLogs.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            logs: [
              {
                // checkin before checkout — diff <= 0 -> "--"
                checkout: { timestamp: "2026-01-15T11:00:00Z" },
                checkin: { timestamp: "2026-01-15T10:59:00Z" },
              },
            ],
          },
        },
      },
    });

    render(
      <BreakLogsDialog open log={baseLog} region="UTC" canEdit />
    );

    await waitFor(() =>
      expect(screen.getByText("Break 1")).toBeInTheDocument()
    );
    // The duration pill falls back to '--'; multiple "--" tokens can also
    // appear if either timestamp is missing, so allowing >=1 is enough.
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to '--' time when a checkout timestamp is missing", async () => {
    apiRef.getAttendanceUserLogs.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            logs: [
              {
                // checkout missing -> formatTime returns "--", duration "--".
                checkout: {},
                checkin: { timestamp: "2026-01-15T10:05:00Z" },
              },
            ],
          },
        },
      },
    });

    render(
      <BreakLogsDialog open log={baseLog} region="UTC" canEdit />
    );

    await waitFor(() =>
      expect(screen.getByText("Break 1")).toBeInTheDocument()
    );
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(1);
    // Singular label when there's exactly one entry.
    expect(screen.getByText(/\bbreak$/)).toBeInTheDocument();
  });

  it("surfaces an empty list when the API rejects (caught and logged)", async () => {
    apiRef.getAttendanceUserLogs.mockRejectedValueOnce(
      new Error("network down")
    );
    // Silence the deliberate console.log in the component's catch.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(
      <BreakLogsDialog open log={baseLog} region="UTC" canEdit />
    );

    await waitFor(() =>
      expect(screen.getByText("No breaks recorded")).toBeInTheDocument()
    );
    logSpy.mockRestore();
  });
});
