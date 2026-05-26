/**
 * Round 90: cover EmployeeLogs/GuardLog.jsx — the per-channel
 * "presence/absence over 24h" guard variant page. Almost identical
 * in shape to VisibilityLog (covered in R89) but pulls data via
 * `getGuardChannelGraph(searchQuery, skip, limit, { date })` and
 * adds a Export-Logs Excel button that walks `channels[].segments`
 * through `prepareLogs` and emits one sheet per camera via
 * xlsx-js-style.
 *
 * Forwards `data / columns / searchKeys / loading / attendanceLogsCount /
 * setCurrentPage / onSearchChange` to ReusableTablePage; renders a date
 * <input>, the Export-Logs button, and a presence/absence legend strip
 * inside the children slot.
 *
 * Mocks (4 — well under 8):
 *   1. ./ReusableTablePage   — captures forwarded props and renders
 *                              children + column header/cell renderers.
 *   2. ./Api/post            — getGuardChannelGraph is a vi.fn() driven
 *                              by the spec.
 *   3. @/components/ui/Tooltip — inline pass-throughs (TimelineBar uses
 *                                TooltipProvider/Tooltip/Trigger/Content).
 *   4. xlsx-js-style         — book_new / utils.json_to_sheet /
 *                              utils.decode_range / utils.encode_cell /
 *                              utils.book_append_sheet / writeFile spies
 *                              so the Export Logs button is observable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

const rtpProps = vi.hoisted(() => ({ value: null }));
const getGuardChannelGraphMock = vi.hoisted(() => vi.fn());
const xlsxSpies = vi.hoisted(() => ({
  book_new: vi.fn(() => ({ tag: "workbook" })),
  json_to_sheet: vi.fn(() => ({ "!ref": "A1:E1", A1: { v: "Camera" } })),
  decode_range: vi.fn(() => ({ s: { c: 0 }, e: { c: 4 } })),
  encode_cell: vi.fn(({ r, c }) => `R${r}C${c}`),
  book_append_sheet: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/ReusableTablePage", () => ({
  default: (props) => {
    rtpProps.value = props;
    const { data, columns, children } = props;
    const row0 = { original: data && data[0] };
    return (
      <div data-testid="rtp">
        <div data-testid="from">{props.from}</div>
        <div data-testid="row-count">{(data || []).length}</div>
        <div data-testid="search-keys">{(props.searchKeys || []).join(",")}</div>
        <div data-testid="loading">{String(!!props.loading)}</div>
        <div data-testid="total-count">{props.attendanceLogsCount}</div>
        <div data-testid="current-page">{props.currentPage}</div>
        <div data-testid="search-query">{props.searchQuery}</div>
        <button
          data-testid="fire-search"
          onClick={() => props.onSearchChange?.("xx")}
        >
          fire-search
        </button>
        <button
          data-testid="fire-page"
          onClick={() => props.setCurrentPage?.(4)}
        >
          fire-page
        </button>
        <div data-testid="cols">
          {(columns || []).map((c, i) => (
            <div key={i} data-testid={`col-${i}`} data-key={c.accessorKey}>
              <div data-testid={`hdr-${i}`}>
                {typeof c.header === "function" ? c.header() : c.header}
              </div>
              <div data-testid={`cell-${i}`}>
                {data && data.length && c.cell ? c.cell({ row: row0 }) : null}
              </div>
            </div>
          ))}
        </div>
        <div data-testid="children-slot">{children}</div>
      </div>
    );
  },
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/post", () => ({
  getGuardChannelGraph: getGuardChannelGraphMock,
  // VisibilityLog also lives in this module — provide a no-op stub to
  // avoid undefined imports if React re-resolves siblings.
  getDeskChannelGraph: vi.fn(),
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <div data-mock="tip">{children}</div>,
  TooltipProvider: ({ children }) => <div data-mock="tip-prov">{children}</div>,
  TooltipTrigger: ({ children }) => <div data-mock="tip-trig">{children}</div>,
  TooltipContent: ({ children }) => <div data-mock="tip-content">{children}</div>,
}));

vi.mock("xlsx-js-style", () => ({
  default: {
    utils: {
      book_new: xlsxSpies.book_new,
      json_to_sheet: xlsxSpies.json_to_sheet,
      decode_range: xlsxSpies.decode_range,
      encode_cell: xlsxSpies.encode_cell,
      book_append_sheet: xlsxSpies.book_append_sheet,
    },
    writeFile: xlsxSpies.writeFile,
  },
}));

const { default: GuardLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/GuardLog.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const sampleResult = (overrides = {}) => ({
  _id: overrides._id || "c1",
  totalPresenceTime: overrides.totalPresenceTime || "5h 0m",
  totalAbsenceTime: overrides.totalAbsenceTime || "1h 0m",
  incidents: overrides.incidents || [
    {
      timeOfIncident: "2025-01-01T00:00:00Z",
      personPresent: true,
      channel: { name: "Cam One", customName: "Front" },
      department: { departmentName: "Ops" },
    },
    {
      timeOfIncident: "2025-01-01T03:00:00Z",
      personPresent: false,
      channel: { name: "Cam One", customName: "Front" },
      department: { departmentName: "Ops" },
    },
    {
      timeOfIncident: "2025-01-01T06:00:00Z",
      personPresent: true,
      channel: { name: "Cam One", customName: "Front" },
      department: { departmentName: "Ops" },
    },
  ],
});

beforeEach(() => {
  getGuardChannelGraphMock.mockReset();
  Object.values(xlsxSpies).forEach((spy) => spy.mockClear());
  // Re-arm default returns after mockClear (since mockClear keeps impls
  // but here xlsxSpies are vi.fn() — they keep their original impls).
  xlsxSpies.book_new.mockReturnValue({ tag: "workbook" });
  xlsxSpies.json_to_sheet.mockReturnValue({
    "!ref": "A1:E1",
    A1: { v: "Camera" },
  });
  xlsxSpies.decode_range.mockReturnValue({ s: { c: 0 }, e: { c: 4 } });
  xlsxSpies.encode_cell.mockImplementation(({ r, c }) => `R${r}C${c}`);
  rtpProps.value = null;
});

describe("GuardLog", () => {
  it("forwards from='visibility' and searchKeys=['channelId','department'] to ReusableTablePage", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    expect(screen.getByTestId("from").textContent).toBe("visibility");
    expect(screen.getByTestId("search-keys").textContent).toBe(
      "channelId,department"
    );
    expect(screen.getByTestId("row-count").textContent).toBe("0");
    expect(screen.getByTestId("current-page").textContent).toBe("1");
  });

  it("calls getGuardChannelGraph on mount with skip=0, limit=10, today's YYYY-MM-DD date", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    expect(getGuardChannelGraphMock).toHaveBeenCalledTimes(1);
    const [searchQuery, skip, limit, payload] =
      getGuardChannelGraphMock.mock.calls[0];
    expect(searchQuery).toBe("");
    expect(skip).toBe(0);
    expect(limit).toBe(10);
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("maps API result into row {id, channelId, customName, department, totals, segments}", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [sampleResult({ _id: "g7" })],
            totalCount: 1,
          },
        },
      },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    const row = rtpProps.value.data[0];
    expect(row.id).toBe("g7");
    expect(row.channelId).toBe("Cam One");
    expect(row.customName).toBe("Front");
    // The product reads `channel.department[0].departmentName`, not the
    // flat `department.departmentName` we provided — so this falls back
    // to "-". This pins the documented selector chain.
    expect(row.department).toBe("-");
    expect(row.totalPresenceTime).toBe("5h 0m");
    expect(row.totalAbsenceTime).toBe("1h 0m");
    expect(row.segments.length).toBeGreaterThan(0);
  });

  it("falls back to 'Channel <id>' + '0h 0m' totals + [] segments when result fields are missing", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [{ _id: "xx", incidents: [] }],
            totalCount: 1,
          },
        },
      },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    const row = rtpProps.value.data[0];
    expect(row.channelId).toBe("Channel xx");
    expect(row.customName).toBe("");
    expect(row.department).toBe("-");
    expect(row.totalPresenceTime).toBe("0h 0m");
    expect(row.totalAbsenceTime).toBe("0h 0m");
    expect(row.segments).toEqual([]);
  });

  it("defines exactly 4 columns: channelId, totalPresenceTime, totalAbsenceTime, segments", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    expect(screen.getByTestId("col-0").getAttribute("data-key")).toBe(
      "channelId"
    );
    expect(screen.getByTestId("col-1").getAttribute("data-key")).toBe(
      "totalPresenceTime"
    );
    expect(screen.getByTestId("col-2").getAttribute("data-key")).toBe(
      "totalAbsenceTime"
    );
    expect(screen.getByTestId("col-3").getAttribute("data-key")).toBe(
      "segments"
    );
    expect(screen.getByTestId("hdr-0").textContent).toMatch(/Channel ID/);
    expect(screen.getByTestId("hdr-1").textContent).toMatch(
      /Total Present Time/
    );
    expect(screen.getByTestId("hdr-2").textContent).toMatch(/Total Absent Time/);
    expect(screen.getByTestId("hdr-3").textContent).toMatch(
      /Visibility Timeline/
    );
  });

  it("channel cell renders channelId + alias subline; presence/absence cells fall back to '0h 0m' when missing", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [
              {
                _id: "c2",
                // no totalPresenceTime / totalAbsenceTime → product defaults to "0h 0m"
                incidents: [
                  {
                    timeOfIncident: "2025-01-01T01:00:00Z",
                    personPresent: true,
                    channel: { name: "Cam X", customName: "Lobby" },
                  },
                  {
                    timeOfIncident: "2025-01-01T05:00:00Z",
                    personPresent: false,
                    channel: { name: "Cam X", customName: "Lobby" },
                  },
                ],
              },
            ],
            totalCount: 1,
          },
        },
      },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    expect(screen.getByTestId("cell-0").textContent).toMatch(/Cam X/);
    expect(screen.getByTestId("cell-0").textContent).toMatch(/Lobby/);
    // Product defaults to "0h 0m" when totalPresenceTime/totalAbsenceTime
    // are absent on the result item — pins the `||` fallback.
    expect(screen.getByTestId("cell-1").textContent).toBe("0h 0m");
    expect(screen.getByTestId("cell-2").textContent).toBe("0h 0m");
    // Column 3 mounts TimelineBar inside TimelineCell; at least one
    // mocked tooltip element should appear since the row has segments.
    expect(
      screen.getByTestId("cell-3").querySelectorAll('[data-mock="tip"]').length
    ).toBeGreaterThan(0);
  });

  it("alias subline is omitted when customName is empty", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [
              {
                _id: "c3",
                incidents: [
                  {
                    timeOfIncident: "2025-01-01T01:00:00Z",
                    personPresent: true,
                    channel: { name: "Cam Y" }, // no customName
                  },
                ],
              },
            ],
            totalCount: 1,
          },
        },
      },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    // No "Alias Name:" subline when customName is falsy.
    expect(screen.getByTestId("cell-0").textContent).not.toMatch(/Alias Name/);
  });

  it("legend strip in children slot shows Presence + Absence labels and an Export Logs button", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    const slot = screen.getByTestId("children-slot");
    expect(slot.textContent).toMatch(/Presence/);
    expect(slot.textContent).toMatch(/Absence/);
    expect(slot.textContent).toMatch(/Export Logs/);
  });

  it("date input change resets currentPage to 1 and re-fires API with the new date", async () => {
    getGuardChannelGraphMock.mockResolvedValue({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    const dateInput = screen
      .getByTestId("children-slot")
      .querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: "2025-04-10" } });
    });
    await flush();
    expect(getGuardChannelGraphMock).toHaveBeenCalledTimes(2);
    const last =
      getGuardChannelGraphMock.mock.calls[
        getGuardChannelGraphMock.mock.calls.length - 1
      ];
    expect(last[3].date).toBe("2025-04-10");
    expect(last[1]).toBe(0); // page reset → skip=0
  });

  it("onSearchChange forwards searchQuery and resets page; setCurrentPage updates current-page", async () => {
    getGuardChannelGraphMock.mockResolvedValue({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-search"));
    });
    await flush();
    expect(screen.getByTestId("search-query").textContent).toBe("xx");
    const last1 =
      getGuardChannelGraphMock.mock.calls[
        getGuardChannelGraphMock.mock.calls.length - 1
      ];
    expect(last1[0]).toBe("xx");

    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-page"));
    });
    await flush();
    expect(screen.getByTestId("current-page").textContent).toBe("4");
    const last2 =
      getGuardChannelGraphMock.mock.calls[
        getGuardChannelGraphMock.mock.calls.length - 1
      ];
    expect(last2[1]).toBe(30); // (4-1)*10
  });

  it("loading flag flips true mid-flight and back to false on resolution", async () => {
    let resolveFn;
    getGuardChannelGraphMock.mockReturnValueOnce(
      new Promise((res) => (resolveFn = res))
    );
    await act(async () => {
      render(<GuardLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("true")
    );
    await act(async () => {
      resolveFn({ data: { body: { data: { result: [], totalCount: 0 } } } });
    });
    await flush();
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("API rejection logs and leaves loading=false / row-count=0", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getGuardChannelGraphMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("row-count").textContent).toBe("0");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("Export Logs with empty channels alerts 'No logs available' and never opens xlsx workbook", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: { body: { data: { result: [], totalCount: 0 } } },
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    await act(async () => {
      render(<GuardLog />);
    });
    await flush();
    const exportBtn = screen
      .getByTestId("children-slot")
      .querySelector("button");
    expect(exportBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(exportBtn);
    });
    expect(alertSpy).toHaveBeenCalledWith("No logs available");
    expect(xlsxSpies.book_new).not.toHaveBeenCalled();
    expect(xlsxSpies.writeFile).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("Export Logs with populated channels writes a workbook with one sheet per camera + filename containing the date", async () => {
    getGuardChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [sampleResult({ _id: "c4" })],
            totalCount: 1,
          },
        },
      },
    });
    await act(async () => {
      render(<GuardLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    const exportBtn = screen
      .getByTestId("children-slot")
      .querySelector("button");
    await act(async () => {
      fireEvent.click(exportBtn);
    });
    expect(xlsxSpies.book_new).toHaveBeenCalledTimes(1);
    // At least one sheet was appended (one per camera channelId).
    expect(xlsxSpies.book_append_sheet).toHaveBeenCalled();
    expect(xlsxSpies.writeFile).toHaveBeenCalledTimes(1);
    const writeArgs = xlsxSpies.writeFile.mock.calls[0];
    // [workbook, filename]
    expect(writeArgs[1]).toMatch(/^camera_logs_\d{4}-\d{2}-\d{2}\.xlsx$/);
    // The sheet name should be the channelId (sliced to 31 chars).
    const sheetCall = xlsxSpies.book_append_sheet.mock.calls[0];
    // [workbook, worksheet, sheetName]
    expect(sheetCall[2]).toBe("Cam One");
  });
});
