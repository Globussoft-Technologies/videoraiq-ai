/**
 * Round 89: cover EmployeeLogs/VisibilityLog.jsx — the per-channel
 * "presence/absence over 24h" page. Pulls channel graph data via
 * getDeskChannelGraph(searchQuery, skip, limit, { date }) on mount + on
 * [currentPage, selectedDate, searchQuery] change, maps each channel's
 * `incidents` list into presence/absence segments (UTC -> local minute
 * offsets), and forwards the resulting columns + data + searchKeys +
 * pagination wiring to ReusableTablePage. Renders a date <input>
 * (clamped to the current month boundary), and a presence/absence
 * legend strip inside the children slot.
 *
 * Mocks (3 — well under 8):
 *   1. ./ReusableTablePage           — captures forwarded props
 *                                       (data/columns/searchKeys/loading/
 *                                       attendanceLogsCount/setCurrentPage/
 *                                       onSearchChange) and renders the
 *                                       children slot + column header/cell
 *                                       renderers for assertion.
 *   2. ./Api/post                    — getDeskChannelGraph is a vi.fn() the
 *                                       spec drives manually.
 *   3. @/components/ui/Tooltip       — inline pass-throughs so the column
 *                                       3 cell renders without Radix.
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
const getDeskChannelGraphMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../../src/page/user/EmployeeLogs/ReusableTablePage", () => ({
  default: (props) => {
    rtpProps.value = props;
    const { data, columns, children } = props;
    const row0 = { original: data[0] };
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
          onClick={() => props.onSearchChange?.("foo")}
        >
          fire
        </button>
        <button
          data-testid="fire-page"
          onClick={() => props.setCurrentPage?.(7)}
        >
          page
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
  getDeskChannelGraph: getDeskChannelGraphMock,
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <div data-mock="tip">{children}</div>,
  TooltipProvider: ({ children }) => <div data-mock="tip-prov">{children}</div>,
  TooltipTrigger: ({ children }) => <div data-mock="tip-trig">{children}</div>,
  TooltipContent: ({ children }) => <div data-mock="tip-content">{children}</div>,
}));

const { default: VisibilityLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/VisibilityLog.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  getDeskChannelGraphMock.mockReset();
  rtpProps.value = null;
});

describe("VisibilityLog", () => {
  it("renders ReusableTablePage with from='visibility' and empty channels initially", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    expect(screen.getByTestId("from").textContent).toBe("visibility");
    expect(screen.getByTestId("search-keys").textContent).toBe(
      "channelId,department"
    );
    expect(screen.getByTestId("row-count").textContent).toBe("0");
    expect(screen.getByTestId("current-page").textContent).toBe("1");
  });

  it("calls getDeskChannelGraph on mount with skip=0, limit=10, today's date", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    expect(getDeskChannelGraphMock).toHaveBeenCalledTimes(1);
    const [searchQuery, skip, limit, payload] =
      getDeskChannelGraphMock.mock.calls[0];
    expect(searchQuery).toBe("");
    expect(skip).toBe(0);
    expect(limit).toBe(10);
    expect(typeof payload.date).toBe("string");
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("maps API response into data rows using channel name + department + segments", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [
              {
                _id: "c1",
                incidents: [
                  {
                    timeOfIncident: "2025-01-01T00:00:00Z",
                    personPresent: true,
                    channel: { name: "Cam One" },
                    department: { departmentName: "Ops" },
                  },
                  {
                    timeOfIncident: "2025-01-01T03:00:00Z",
                    personPresent: false,
                    channel: { name: "Cam One" },
                    department: { departmentName: "Ops" },
                  },
                  {
                    timeOfIncident: "2025-01-01T06:00:00Z",
                    personPresent: true,
                    channel: { name: "Cam One" },
                    department: { departmentName: "Ops" },
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
      render(<VisibilityLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    expect(screen.getByTestId("total-count").textContent).toBe("1");
    expect(rtpProps.value.data[0].id).toBe("c1");
    expect(rtpProps.value.data[0].channelId).toBe("Cam One");
    expect(rtpProps.value.data[0].department).toBe("Ops");
    // At least one segment should have been generated from the 3 incidents.
    expect(rtpProps.value.data[0].segments.length).toBeGreaterThan(0);
  });

  it("falls back to 'Channel <id>' + '-' department when channel/department missing", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [
              {
                _id: "xx",
                incidents: [], // no channel/dept info, no segments
              },
            ],
            totalCount: 1,
          },
        },
      },
    });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    expect(rtpProps.value.data[0].channelId).toBe("Channel xx");
    expect(rtpProps.value.data[0].department).toBe("-");
    expect(rtpProps.value.data[0].segments).toEqual([]);
  });

  it("defines exactly 3 columns: channelId, department, segments", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    expect(screen.getByTestId("col-0").getAttribute("data-key")).toBe(
      "channelId"
    );
    expect(screen.getByTestId("col-1").getAttribute("data-key")).toBe(
      "department"
    );
    expect(screen.getByTestId("col-2").getAttribute("data-key")).toBe(
      "segments"
    );
    expect(screen.getByTestId("hdr-0").textContent).toMatch(/Channel ID/);
    expect(screen.getByTestId("hdr-1").textContent).toMatch(/Department/);
    expect(screen.getByTestId("hdr-2").textContent).toMatch(
      /Visibility Timeline/
    );
  });

  it("channelId / department cells render row value; segments cell renders TimelineBar with seg count", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            result: [
              {
                _id: "c2",
                incidents: [
                  {
                    timeOfIncident: "2025-01-01T01:00:00Z",
                    personPresent: true,
                    channel: { name: "Cam X" },
                    department: { departmentName: "Sec" },
                  },
                  {
                    timeOfIncident: "2025-01-01T05:00:00Z",
                    personPresent: false,
                    channel: { name: "Cam X" },
                    department: { departmentName: "Sec" },
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
      render(<VisibilityLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("row-count").textContent).toBe("1")
    );
    expect(screen.getByTestId("cell-0").textContent).toBe("Cam X");
    expect(screen.getByTestId("cell-1").textContent).toBe("Sec");
    // Column 3 mounts the TimelineBar (TooltipProvider mock with 1+ tooltip)
    expect(
      screen.getByTestId("cell-2").querySelectorAll('[data-mock="tip"]').length
    ).toBeGreaterThan(0);
  });

  it("legend strip in the children slot shows both Presence and Absence labels", async () => {
    getDeskChannelGraphMock.mockResolvedValueOnce({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    const slot = screen.getByTestId("children-slot");
    expect(slot.textContent).toMatch(/Presence/);
    expect(slot.textContent).toMatch(/Absence/);
  });

  it("date input change resets currentPage to 1 and re-fires API with new date", async () => {
    getDeskChannelGraphMock.mockResolvedValue({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    expect(getDeskChannelGraphMock).toHaveBeenCalledTimes(1);
    const dateInput = screen
      .getByTestId("children-slot")
      .querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: "2025-03-15" } });
    });
    await flush();
    // Date change triggers the effect with new selectedDate.
    expect(getDeskChannelGraphMock).toHaveBeenCalledTimes(2);
    const last =
      getDeskChannelGraphMock.mock.calls[
        getDeskChannelGraphMock.mock.calls.length - 1
      ];
    expect(last[3].date).toBe("2025-03-15");
    // currentPage reset to 1 -> skip stays 0
    expect(last[1]).toBe(0);
  });

  it("onSearchChange from ReusableTablePage forwards new searchQuery + resets page", async () => {
    getDeskChannelGraphMock.mockResolvedValue({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-search"));
    });
    await flush();
    // Either the search OR page reset would refire the effect — assert wiring.
    expect(screen.getByTestId("search-query").textContent).toBe("foo");
    const calls = getDeskChannelGraphMock.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("foo");
  });

  it("setCurrentPage prop triggers fetch with skip = (page-1)*10", async () => {
    getDeskChannelGraphMock.mockResolvedValue({ data: { body: { data: { result: [], totalCount: 0 } } } });
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-page"));
    });
    await flush();
    expect(screen.getByTestId("current-page").textContent).toBe("7");
    const last =
      getDeskChannelGraphMock.mock.calls[
        getDeskChannelGraphMock.mock.calls.length - 1
      ];
    expect(last[1]).toBe(60); // (7 - 1) * 10
  });

  it("loading flag flips during the API call and back to false on resolution", async () => {
    let resolveFn;
    getDeskChannelGraphMock.mockReturnValueOnce(
      new Promise((res) => (resolveFn = res))
    );
    await act(async () => {
      render(<VisibilityLog />);
    });
    // Mid-flight, loading should be true (effect set it before awaiting).
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
    getDeskChannelGraphMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<VisibilityLog />);
    });
    await flush();
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("row-count").textContent).toBe("0");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
