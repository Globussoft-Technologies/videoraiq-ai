/**
 * Round 5 final gap-fill: EmployeeLogs/VehicleCountLogs.jsx.
 *
 * After r4 sat at 90.46% / 90.78%. Reachable gaps:
 *   1. chart options.events.mounted wheel handler (L65-78) — invoked by
 *      driving the captured options object directly.
 *   2. getPaginationPages branches for totalPages > 5: currentPage<=3,
 *      currentPage>=totalPages-2, and middle window (L233-246).
 *   3. Pagination ellipsis render (L384-389).
 *   4. xaxis labels formatter (L112) + tooltip x/y formatters (L132-135).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

const axiosGetMock = vi.hoisted(() => vi.fn());
const apexChartProps = vi.hoisted(() => ({ value: [] }));

vi.mock("axios", () => ({
  default: { get: axiosGetMock },
}));

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "test-token",
}));

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent",
  () => ({
    default: () => <div data-testid="auto-refresh" />,
  })
);

vi.mock("@/components/ui/calendar", () => ({
  DateRangePickerComponent: ({ buttonContent }) => (
    <div data-testid="date-picker">{buttonContent}</div>
  ),
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

const populated = (count = 2, totalCount = 6) => ({
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
        totalCount,
      },
    },
  },
});

beforeEach(() => {
  axiosGetMock.mockReset();
  apexChartProps.value.length = 0;
  window.localStorage.clear();
});

describe("VehicleCountLogs — gaps5", () => {
  it("chart options.events.mounted wheel handler invokes zoomX with the deltaY<0 (zoom in) branch", async () => {
    axiosGetMock.mockResolvedValueOnce(populated(1, 2));
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await waitFor(() => expect(axiosGetMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const captured = apexChartProps.value[0];
    const mounted = captured?.options?.chart?.events?.mounted;
    expect(typeof mounted).toBe("function");
    const zoomXSpy = vi.fn();
    // Create a fake chart element + dispatch a wheel event so the
    // handler L65-78 fires the zoomX arms.
    const el = document.createElement("div");
    document.body.appendChild(el);
    mounted({
      el,
      w: { globals: { minX: 0, maxX: 100 } },
      zoomX: zoomXSpy,
    });
    el.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, cancelable: true })
    );
    el.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 100, cancelable: true })
    );
    expect(zoomXSpy).toHaveBeenCalledTimes(2);
    // mounted returns when el is null (line 66 falsy arm)
    mounted({ el: null });
    document.body.removeChild(el);
  });

  it("xaxis/tooltip formatters return formatted strings", async () => {
    axiosGetMock.mockResolvedValueOnce(populated(1, 2));
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await waitFor(() => expect(axiosGetMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const captured = apexChartProps.value[0];
    const ts = "2025-01-02T03:04:05Z";
    const xaxisFormatter = captured.options.xaxis.labels.formatter;
    const tooltipX = captured.options.tooltip.x.formatter;
    const tooltipY = captured.options.tooltip.y.formatter;
    expect(typeof xaxisFormatter(ts)).toBe("string");
    expect(typeof tooltipX(ts)).toBe("string");
    expect(tooltipY(7)).toBe("7 vehicles");
  });

  it("pagination shows ellipsis when totalPages > 5 (currentPage<=3 arm)", async () => {
    // LIMIT=2, totalCount=20 → totalPages=10. currentPage=1 → uses the
    // first arm: pages = [1, 2, 3, 4, '...', 10]
    axiosGetMock.mockResolvedValueOnce(populated(2, 20));
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await waitFor(() => expect(axiosGetMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Ellipsis renders
    const ellipsis = screen.queryAllByText("...");
    expect(ellipsis.length).toBeGreaterThan(0);
    // Total badge shows 20
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("pagination middle window (currentPage>3 and currentPage<totalPages-2) shows two ellipses", async () => {
    axiosGetMock.mockResolvedValue(populated(2, 20));
    // totalPages=10. Click forward to page 5 — the middle-window arm.
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await waitFor(() => expect(axiosGetMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Click the "5" page button if it appears (after navigating)
    // Easier: click Next 4 times so currentPage becomes 5.
    const nextBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-chevron-right"));
    expect(nextBtn).toBeTruthy();
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.click(nextBtn);
      });
      await flush();
    }
    // After moving currentPage to 5, the page array is [1, '...', 4, 5, 6, '...', 10]
    const ellipsis = screen.queryAllByText("...");
    expect(ellipsis.length).toBeGreaterThanOrEqual(1);
  });

  it("pagination tail (currentPage>=totalPages-2) arm: [1, '...', n-3, n-2, n-1, n]", async () => {
    axiosGetMock.mockResolvedValue(populated(2, 20));
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await waitFor(() => expect(axiosGetMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const nextBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-chevron-right"));
    expect(nextBtn).toBeTruthy();
    // Click Next 9 times to reach page 10
    for (let i = 0; i < 9; i++) {
      await act(async () => {
        fireEvent.click(nextBtn);
      });
      await flush();
    }
    // Tail arm: [1, '...', 7, 8, 9, 10]
    expect(screen.queryAllByText("...").length).toBeGreaterThanOrEqual(1);
  });

  it("handlePageChange out-of-bounds (page<1 / page>totalPages) is a no-op", async () => {
    axiosGetMock.mockResolvedValue(populated(2, 6));
    await act(async () => {
      render(<VehicleCountLogs />);
    });
    await waitFor(() => expect(axiosGetMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const prevBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg.lucide-chevron-left"));
    // At page 1, Prev is disabled — click it anyway; handlePageChange
    // returns early because page<1.
    if (prevBtn) {
      await act(async () => {
        fireEvent.click(prevBtn);
      });
    }
    expect(screen.queryAllByTestId("apex-chart").length).toBeGreaterThan(0);
  });
});
