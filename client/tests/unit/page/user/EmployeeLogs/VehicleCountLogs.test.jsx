/**
 * Round 90 (private-only): cover EmployeeLogs/VehicleCountLogs.jsx —
 * the per-NVR vehicle-count time-series page. The file is missing
 * from the public mirror (R86 lesson: verify both clones before
 * mirroring), so this test commits to private only.
 *
 * The page fires axios GET to /api/v1/incidents/logs/vehicle-count on
 * mount + on [skip, startDate, endDate] dep change, persists
 * autoRefresh + refreshInterval to localStorage on each change,
 * drives a per-interval setInterval refetch when autoRefresh is true,
 * renders a ReactApexChart per record (empty series -> "No time-series
 * data" fallback), shows a 64x64 not-found image when records list is
 * empty, and the smart paginator clamps clicks to [1, totalPages] and
 * generates the documented ellipsis pages array.
 *
 * Mocks (5 — well under 8):
 *   1. axios                                  — get spy the spec drives.
 *   2. @/utils/getAccessToken                  — flat string returner.
 *   3. ./components/AutoRefreshComponent      — pass-through that
 *                                                forwards setter callbacks.
 *   4. @/components/ui/calendar               — DateRangePickerComponent
 *                                                exposes a button that
 *                                                fires onRangeChange.
 *   5. react-apexcharts                       — capture-only stub so the
 *                                                chart renders without
 *                                                pulling apexcharts/svg.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

const axiosGetMock = vi.hoisted(() => vi.fn());
const apexChartProps = vi.hoisted(() => ({ value: [] }));
const rangeChangeCb = vi.hoisted(() => ({ value: null }));

vi.mock("axios", () => ({
  default: {
    get: axiosGetMock,
  },
}));

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "test-token",
}));

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent",
  () => ({
    default: (props) => (
      <div data-testid="auto-refresh">
        <button
          data-testid="ar-toggle"
          onClick={() => props.onActiveChange?.(!props.isActive)}
        >
          {String(props.isActive)}
        </button>
        <button
          data-testid="ar-interval"
          onClick={() => props.onIntervalChange?.(60)}
        >
          {String(props.refreshInterval)}
        </button>
        <button data-testid="ar-manual" onClick={() => props.onManualRefresh?.()}>
          manual
        </button>
      </div>
    ),
  })
);

vi.mock("@/components/ui/calendar", () => ({
  DateRangePickerComponent: (props) => {
    rangeChangeCb.value = props.onRangeChange;
    return (
      <div data-testid="date-picker">
        <button
          data-testid="fire-range-null"
          onClick={() => props.onRangeChange?.(null)}
        >
          fire-null
        </button>
        <button
          data-testid="fire-range-date"
          onClick={() =>
            props.onRangeChange?.({
              start: new Date("2025-04-01T00:00:00Z"),
              end: new Date("2025-04-05T00:00:00Z"),
            })
          }
        >
          fire-date
        </button>
        <button
          data-testid="fire-range-iso"
          onClick={() =>
            props.onRangeChange?.({ start: "2025-05-01", end: "2025-05-03" })
          }
        >
          fire-iso
        </button>
        <button
          data-testid="fire-range-empty"
          onClick={() =>
            props.onRangeChange?.({ start: null, end: null })
          }
        >
          fire-empty
        </button>
      </div>
    );
  },
}));

vi.mock("react-apexcharts", () => ({
  default: (props) => {
    apexChartProps.value.push(props);
    return (
      <div data-testid="apex-chart" data-type={props.type}>
        <div data-testid="apex-series-len">
          {(props.series?.[0]?.data || []).length}
        </div>
      </div>
    );
  },
}));

const { default: VehicleCountLogs } = await import(
  "../../../../../src/page/user/EmployeeLogs/VehicleCountLogs.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const emptyOk = () => ({
  data: { body: { data: { data: [], totalCount: 0 } } },
});

const populated = (count = 1) => ({
  data: {
    body: {
      data: {
        data: Array.from({ length: count }, (_, i) => ({
          nvrData: { nvrName: `NVR-${i}` },
          channelData: { name: `Cam-${i}` },
          timeSeries: [
            { timestamp: "2025-01-01T01:00:00Z", count: 3 },
            { timestamp: "2025-01-01T01:05:00Z", count: 5 },
          ],
        })),
        totalCount: 6, // > LIMIT(2) so paginator renders
      },
    },
  },
});

beforeEach(() => {
  axiosGetMock.mockReset();
  apexChartProps.value = [];
  rangeChangeCb.value = null;
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VehicleCountLogs", () => {
  it("fires GET on mount with default skip=0/limit=2 and today's start/end dates + token header", async () => {
    axiosGetMock.mockResolvedValueOnce(emptyOk());
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await flush();
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    const [url, opts] = axiosGetMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/incidents\/logs\/vehicle-count$/);
    expect(opts.params.skip).toBe(0);
    expect(opts.params.limit).toBe(2);
    expect(opts.params.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opts.params.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opts.headers["x-access-token"]).toBe("test-token");
  });

  it("empty payload shows the not-found image fallback and hides paginator", async () => {
    axiosGetMock.mockResolvedValueOnce(emptyOk());
    const { container } = render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(container.querySelector('img[alt="No logs found"]')).not.toBeNull()
    );
    expect(screen.queryByTestId("apex-chart")).toBeNull();
    // Total logs strip is gated on charts.length > 0, so it shouldn't render.
    expect(screen.queryByText(/Total logs/)).toBeNull();
  });

  it("populated payload renders one ApexChart per record with the documented series mapping", async () => {
    axiosGetMock.mockResolvedValueOnce(populated(2));
    render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(screen.getAllByTestId("apex-chart").length).toBe(2)
    );
    const charts = screen.getAllByTestId("apex-chart");
    expect(charts[0].getAttribute("data-type")).toBe("area");
    // Each chart's series carries the 2 timeSeries points.
    const seriesLens = screen.getAllByTestId("apex-series-len").map(
      (el) => el.textContent
    );
    expect(seriesLens).toEqual(["2", "2"]);
    // Verify NVR/Camera header chips render the record metadata.
    expect(screen.getByText(/NVR-0/)).toBeInTheDocument();
    expect(screen.getByText(/Cam-0/)).toBeInTheDocument();
  });

  it("empty timeSeries renders the 'No time-series data' fallback instead of the chart", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            data: [
              {
                nvrData: { nvrName: "NVR-A" },
                channelData: { name: "Cam-A" },
                timeSeries: [],
              },
            ],
            totalCount: 1,
          },
        },
      },
    });
    render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(screen.getByText(/No time-series data/)).toBeInTheDocument()
    );
    expect(screen.queryByTestId("apex-chart")).toBeNull();
  });

  it("missing nvrData / channelData fall back to '--' chips", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            data: [
              {
                // no nvrData / channelData / timeSeries
              },
            ],
            totalCount: 1,
          },
        },
      },
    });
    render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(screen.getByText(/No time-series data/)).toBeInTheDocument()
    );
    // Both header chips fall back to '--'.
    const dashChips = screen.getAllByText("--");
    expect(dashChips.length).toBeGreaterThanOrEqual(2);
  });

  it("paginator next-click bumps skip by LIMIT=2 and prev-click on page 1 is disabled (skip stays 0)", async () => {
    axiosGetMock.mockResolvedValue(populated(2));
    render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(screen.getAllByTestId("apex-chart").length).toBe(2)
    );
    // Find the Next button (last button in the pagination strip).
    const pagButtons = screen.getAllByRole("button");
    // The pagination row has prev, page buttons, next. The first button is
    // the Prev chevron; the last is the Next chevron.
    const nextBtn = pagButtons[pagButtons.length - 1];
    const prevBtn = pagButtons.find((b) => b.disabled);
    expect(prevBtn).toBeTruthy(); // Prev is disabled on page 1.
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    await flush();
    const lastCall =
      axiosGetMock.mock.calls[axiosGetMock.mock.calls.length - 1];
    // page=2 -> skip = (2-1) * 2 = 2
    expect(lastCall[1].params.skip).toBe(2);
  });

  it("date-range picker passes Date objects through moment().format('YYYY-MM-DD') and refires the API", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-range-date"));
    });
    await flush();
    const last = axiosGetMock.mock.calls[axiosGetMock.mock.calls.length - 1];
    expect(last[1].params.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(last[1].params.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("date-range picker accepts pre-formatted ISO strings (no Date wrapping needed)", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-range-iso"));
    });
    await flush();
    const last = axiosGetMock.mock.calls[axiosGetMock.mock.calls.length - 1];
    expect(last[1].params.startDate).toBe("2025-05-01");
    expect(last[1].params.endDate).toBe("2025-05-03");
  });

  it("null range payload is a no-op (no refetch beyond the mount call)", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-range-null"));
    });
    await flush();
    // No refetch — date state didn't change.
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
  });

  it("empty start/end range clears the params (no startDate/endDate keys forwarded)", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("fire-range-empty"));
    });
    await flush();
    const last = axiosGetMock.mock.calls[axiosGetMock.mock.calls.length - 1];
    // The conditional spread `...(startDate && { startDate })` strips both
    // keys when state is empty string.
    expect(last[1].params).not.toHaveProperty("startDate");
    expect(last[1].params).not.toHaveProperty("endDate");
  });

  it("manual refresh button refires the API without changing skip/dates", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-manual"));
    });
    await flush();
    expect(axiosGetMock).toHaveBeenCalledTimes(2);
    const last = axiosGetMock.mock.calls[1];
    expect(last[1].params.skip).toBe(0);
  });

  it("AutoRefresh toggle persists boolean to localStorage under the documented key", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    // Default true (per the localStorage-null fall-back).
    expect(window.localStorage.getItem("vehicle_count_auto_refresh_enabled"))
      .toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-toggle"));
    });
    await flush();
    expect(window.localStorage.getItem("vehicle_count_auto_refresh_enabled"))
      .toBe("false");
  });

  it("AutoRefresh interval change persists number to localStorage under the documented key", async () => {
    axiosGetMock.mockResolvedValue(emptyOk());
    render(<VehicleCountLogs />);
    await flush();
    expect(window.localStorage.getItem("vehicle_count_auto_refresh_interval"))
      .toBe("30");
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-interval"));
    });
    await flush();
    expect(window.localStorage.getItem("vehicle_count_auto_refresh_interval"))
      .toBe("60");
  });

  it("API rejection surfaces the 'Failed to load data.' error pane and hides charts/empty/loading", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    axiosGetMock.mockRejectedValueOnce(new Error("boom"));
    render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to load data\./)).toBeInTheDocument()
    );
    expect(screen.queryByTestId("apex-chart")).toBeNull();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("loading state shows the 'Loading...' placeholder mid-flight then hides on resolution", async () => {
    let resolveFn;
    axiosGetMock.mockReturnValueOnce(
      new Promise((res) => (resolveFn = res))
    );
    render(<VehicleCountLogs />);
    await waitFor(() =>
      expect(screen.getByText(/Loading\.\.\./)).toBeInTheDocument()
    );
    await act(async () => {
      resolveFn(emptyOk());
    });
    await flush();
    expect(screen.queryByText(/Loading\.\.\./)).toBeNull();
  });
});
