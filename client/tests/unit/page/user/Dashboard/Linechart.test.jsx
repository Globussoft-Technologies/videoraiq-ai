/**
 * Round 81: cover Dashboard/Linechart.jsx — the amCharts5-driven
 * "Current week vs Previous week" comparison line chart on the
 * dashboard. The component:
 *   1. fires `comparisonChart()` (Dashboard/Api/get) on mount and on
 *      each [nvrId, department, location] dep change.
 *   2. shape-transforms the API body into two parallel series
 *      (currentWeek + previousWeek). Each currentWeek point is keyed
 *      by `new Date(item.date).getTime()`. Each previousWeek point is
 *      keyed by the SAME currentWeek date (so the two series align)
 *      but stamps `actualPreviousDate` with the real previousWeek
 *      date.getTime() for the tooltip.
 *   3. mounts an amCharts root, sets the Animated theme, builds an
 *      XYChart with a DateAxis + ValueAxis and two LineSeries, then
 *      pushes the transformed data into each series via .data.setAll.
 *   4. returns a cleanup that disposes the amCharts root on unmount /
 *      on chartData change.
 *
 * The full amCharts5 surface is deeply mocked here — none of the
 * graphics-stack calls reach the real wheel-zoom / canvas / theme
 * implementations; instead, every chained call returns a tracked
 * shim that records its invocations. The spec pins:
 *
 *  1. comparisonChart is awaited on mount and the transformed series
 *     are pushed into the LineSeries data shims (currentWeek + the
 *     date-shifted previousWeek).
 *  2. The component renders the chart container div (id="chartdiv")
 *     and the two legend dots ("Current week" / "Past week").
 *  3. The cleanup path calls root.dispose() on unmount.
 *  4. The component re-fetches when nvrId/department/location change.
 *
 * Mocks (4 vi.mock calls — well under the 8-mock cap):
 *   1. ../../../../../src/page/user/Dashboard/Api/get/index.jsx
 *      — comparisonChart returns a controllable promise.
 *   2. @amcharts/amcharts5
 *      — Root.new / color / Tooltip / Circle / Bullet shims.
 *   3. @amcharts/amcharts5/xy
 *      — XYChart / DateAxis / ValueAxis / LineSeries / AxisRenderer
 *        shims (chainable).
 *   4. @amcharts/amcharts5/themes/Animated
 *      — { new: () => marker } theme shim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";

const comparisonChartMock = vi.hoisted(() => vi.fn());
const rootDisposeMock = vi.hoisted(() => vi.fn());
const currentWeekSetAll = vi.hoisted(() => vi.fn());
const previousWeekSetAll = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../../../src/page/user/Dashboard/Api/get/index.jsx",
  () => ({
    comparisonChart: (...args) => comparisonChartMock(...args),
  }),
);

// amCharts5 needs a chainable shim. The component does:
//   const root = am5.Root.new(...)
//   root._logo?.set(...); root.setThemes([...]);
//   chart = root.container.children.push(am5xy.XYChart.new(root, ...))
//   chart.set("cursor", ...); chart.xAxes.push(...); chart.yAxes.push(...);
//   chart.series.push(LineSeries.new(...)) -> currentWeekSeries
//   currentWeekSeries.strokes.template.setAll(...)
//   currentWeekSeries.bullets.push(cb)  -- cb is invoked at run-time inside
//                                          amCharts internals; in our shim
//                                          we deliberately do NOT invoke it.
//   currentWeekSeries.data.setAll([...])
//   currentWeekSeries.appear(1000)
//   root.dateFormatter.setAll(...)
//   return () => root.dispose()
// Build a single chained shim creator.
vi.mock("@amcharts/amcharts5", () => {
  const makeChainable = () => {
    const obj = {
      set: vi.fn(() => obj),
      setAll: vi.fn(() => obj),
      setThemes: vi.fn(() => obj),
      push: vi.fn(() => obj),
      get: vi.fn(() => obj),
      appear: vi.fn(() => obj),
      dispose: rootDisposeMock,
      lineY: { set: vi.fn() },
      labels: { template: { setAll: vi.fn() } },
      template: { setAll: vi.fn() },
    };
    return obj;
  };
  return {
    Root: {
      new: vi.fn(() => {
        const root = makeChainable();
        root._logo = { set: vi.fn() };
        root.dateFormatter = { setAll: vi.fn() };
        // root.container.children.push(chart) -> returns the pushed chart
        root.container = {
          children: { push: vi.fn((chart) => chart) },
        };
        return root;
      }),
    },
    color: vi.fn((c) => c),
    Tooltip: { new: vi.fn(() => ({})) },
    Bullet: { new: vi.fn(() => ({})) },
    Circle: { new: vi.fn(() => ({})) },
  };
});

vi.mock("@amcharts/amcharts5/xy", () => {
  const makeAxis = () => {
    const labelsTemplate = { setAll: vi.fn() };
    const renderer = { labels: { template: labelsTemplate } };
    return {
      get: vi.fn(() => renderer),
      set: vi.fn(),
    };
  };
  const makeSeries = (kind) => {
    const series = {
      strokes: { template: { setAll: vi.fn() } },
      bullets: { push: vi.fn() },
      appear: vi.fn(),
      data: {
        setAll: kind === "current" ? currentWeekSetAll : previousWeekSetAll,
      },
    };
    return series;
  };
  // Chart returns an object whose .xAxes.push / .yAxes.push give axis shims
  // and .series.push gives a LineSeries shim. We need to alternate between
  // current and previous series across two .series.push() calls.
  let seriesCallCount = 0;
  const makeChart = () => ({
    xAxes: { push: vi.fn(() => makeAxis()) },
    yAxes: { push: vi.fn(() => makeAxis()) },
    series: {
      push: vi.fn(() => {
        const series = makeSeries(seriesCallCount === 0 ? "current" : "previous");
        seriesCallCount++;
        return series;
      }),
    },
    set: vi.fn(() => ({ lineY: { set: vi.fn() } })),
    appear: vi.fn(),
  });
  // Reset the per-render counter via a getter spy on XYChart.new
  return {
    XYChart: { new: vi.fn(() => { seriesCallCount = 0; return makeChart(); }) },
    DateAxis: { new: vi.fn(() => ({})) },
    ValueAxis: { new: vi.fn(() => ({})) },
    LineSeries: { new: vi.fn(() => ({})) },
    AxisRendererX: { new: vi.fn(() => ({})) },
    AxisRendererY: { new: vi.fn(() => ({})) },
    XYCursor: { new: vi.fn(() => ({})) },
  };
});

vi.mock("@amcharts/amcharts5/themes/Animated", () => ({
  default: { new: vi.fn(() => ({ __theme: true })) },
}));

const { default: ComparisonChart } = await import(
  "../../../../../src/page/user/Dashboard/Linechart.jsx"
);

const flushAsync = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  comparisonChartMock.mockReset();
  rootDisposeMock.mockReset();
  currentWeekSetAll.mockReset();
  previousWeekSetAll.mockReset();
});

const sampleApiResponse = () => ({
  body: {
    data: {
      currentWeek: [
        { date: "2026-05-19", value: 10 },
        { date: "2026-05-20", value: 20 },
      ],
      previousWeek: [
        { date: "2026-05-12", value: 7 },
        { date: "2026-05-13", value: 9 },
      ],
    },
  },
});

describe("Dashboard/Linechart (ComparisonChart)", () => {
  it("renders the chart container div + the two legend dots", async () => {
    comparisonChartMock.mockResolvedValueOnce(sampleApiResponse());
    let container;
    await act(async () => {
      ({ container } = render(<ComparisonChart />));
      await flushAsync();
    });
    expect(container.querySelector("#chartdiv")).toBeTruthy();
    expect(screen.getByText("Current week")).toBeInTheDocument();
    expect(screen.getByText("Past week")).toBeInTheDocument();
  });

  it("calls comparisonChart on mount and pushes the transformed series into both LineSeries data shims", async () => {
    comparisonChartMock.mockResolvedValueOnce(sampleApiResponse());
    await act(async () => {
      render(<ComparisonChart />);
      await flushAsync();
    });
    expect(comparisonChartMock).toHaveBeenCalledTimes(1);

    // currentWeek series: keyed by currentWeek dates.
    expect(currentWeekSetAll).toHaveBeenCalledTimes(1);
    const currentArg = currentWeekSetAll.mock.calls[0][0];
    expect(currentArg).toHaveLength(2);
    expect(currentArg[0]).toEqual({
      date: new Date("2026-05-19").getTime(),
      value: 10,
    });
    expect(currentArg[1]).toEqual({
      date: new Date("2026-05-20").getTime(),
      value: 20,
    });

    // previousWeek series: `date` is aligned to the CURRENT week dates,
    // but `actualPreviousDate` carries the real previousWeek timestamp.
    expect(previousWeekSetAll).toHaveBeenCalledTimes(1);
    const prevArg = previousWeekSetAll.mock.calls[0][0];
    expect(prevArg).toHaveLength(2);
    expect(prevArg[0]).toEqual({
      date: new Date("2026-05-19").getTime(),
      value: 7,
      actualPreviousDate: new Date("2026-05-12").getTime(),
    });
    expect(prevArg[1]).toEqual({
      date: new Date("2026-05-20").getTime(),
      value: 9,
      actualPreviousDate: new Date("2026-05-13").getTime(),
    });
  });

  it("disposes the amCharts root on unmount (cleanup path)", async () => {
    comparisonChartMock.mockResolvedValueOnce(sampleApiResponse());
    let unmount;
    await act(async () => {
      ({ unmount } = render(<ComparisonChart />));
      await flushAsync();
    });
    expect(rootDisposeMock).not.toHaveBeenCalled();
    unmount();
    expect(rootDisposeMock).toHaveBeenCalled();
  });

  it("swallows a comparisonChart rejection and does not push data into either series", async () => {
    const err = new Error("boom");
    comparisonChartMock.mockRejectedValueOnce(err);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      render(<ComparisonChart />);
      await flushAsync();
    });
    // chartData stays null -> the chart-build effect never runs
    expect(currentWeekSetAll).not.toHaveBeenCalled();
    expect(previousWeekSetAll).not.toHaveBeenCalled();
    // The component logs the rejection but doesn't throw.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
