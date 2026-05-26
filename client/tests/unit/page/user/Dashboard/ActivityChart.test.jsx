/**
 * Round 83: cover Dashboard/ActivityChart.jsx — the 2-slide dashboard
 * carousel on the right rail.
 *   - Slide 0 ('activity'): bar/stacked ReactApexChart driven by
 *     getDetectionData() (Dashboard/Api/post). On 200 the response
 *     body.data is transformed key->label, accumulating a totalPerDay
 *     across all keys, and a final "Neutral" series is appended with
 *     max(0, 100-totalPerDay[i]) per day. On non-200 or rejection
 *     series resets to []. The series[0].data.length>0 branch mounts
 *     ReactApexChart; otherwise the "No detection found" empty pane
 *     renders.
 *   - Slide 1 ('comparison', initial): the imported ComparisonChart is
 *     mounted with the forwarded nvrId/department/location props.
 *   - The carousel starts at index 1 (comparison). handlePrevChart /
 *     handleNextChart cycle modulo 2; goToChart(i) jumps directly. The
 *     two pagination dots reflect the current index.
 *   - While loading=true, the title, chart area, chevron arrows, and
 *     pagination dots all render Skeleton placeholders.
 *
 * Mocks (5 — well under 8):
 *   1. ./Api/post                — getDetectionData controllable promise.
 *   2. ./Linechart                — ComparisonChart marker that captures
 *                                   the forwarded nvrId/department/location.
 *   3. react-apexcharts           — ReactApexChart marker that captures
 *                                   the series + height (real impl pulls
 *                                   in the full apexcharts canvas stack).
 *   4. react-loading-skeleton     — Skeleton marker so we can count
 *                                   placeholders in the loading state.
 *   5. (none) — lucide-react icons render fine as inline SVGs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

const getDetectionDataMock = vi.hoisted(() => vi.fn());
const linechartProps = vi.hoisted(() => ({ value: null }));
const apexProps = vi.hoisted(() => ({ value: null }));

vi.mock(
  "../../../../../src/page/user/Dashboard/Api/post",
  () => ({
    getDetectionData: (...args) => getDetectionDataMock(...args),
  }),
);

vi.mock("../../../../../src/page/user/Dashboard/Linechart", () => ({
  default: (props) => {
    linechartProps.value = props;
    return <div data-testid="comparison-chart" />;
  },
}));

vi.mock("react-apexcharts", () => ({
  default: (props) => {
    apexProps.value = props;
    return (
      <div data-testid="apex-chart" data-height={props.height}>
        <span data-testid="apex-series-count">
          {(props.series || []).length}
        </span>
      </div>
    );
  },
}));

vi.mock("react-loading-skeleton", () => ({
  default: (props) => (
    <div
      data-testid="skeleton"
      data-width={String(props.width ?? "")}
      data-height={String(props.height ?? "")}
      data-circle={String(!!props.circle)}
    />
  ),
}));

// The CSS import in the source file resolves to nothing under vitest's
// css:false setting, but mock it explicitly to be safe.
vi.mock("react-loading-skeleton/dist/skeleton.css", () => ({}));

const { default: ActivityChart } = await import(
  "../../../../../src/page/user/Dashboard/ActivityChart.jsx"
);

beforeEach(() => {
  getDetectionDataMock.mockReset();
  linechartProps.value = null;
  apexProps.value = null;
});

describe("ActivityChart", () => {
  it("starts on slide 1 (Comparison) and mounts ComparisonChart with the forwarded props", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: { statusCode: 200, body: { data: {} } },
    });
    await act(async () => {
      render(
        <ActivityChart nvrId="nvr-1" department="dept-1" location="loc-1" />
      );
    });
    expect(screen.getByTestId("comparison-chart")).toBeInTheDocument();
    expect(linechartProps.value).toEqual({
      nvrId: "nvr-1",
      department: "dept-1",
      location: "loc-1",
    });
    // The Comparison slide title copy.
    expect(
      screen.getByText("Multi-Camera Activity Review & Comparison")
    ).toBeInTheDocument();
  });

  it("clicks Prev arrow -> jumps to slide 0 (Activity) -> the empty-state pane shows when series is empty", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: { statusCode: 200, body: { data: {} } },
    });
    await act(async () => {
      render(<ActivityChart />);
    });
    fireEvent.click(screen.getByLabelText("Previous chart"));
    // empty series -> the "No detection found" pane
    expect(screen.getByText("No detection found")).toBeInTheDocument();
    expect(screen.queryByTestId("apex-chart")).toBeNull();
    // Activity slide title copy now shown.
    expect(
      screen.getByText("AI Detection Activity Over the Past Week")
    ).toBeInTheDocument();
  });

  it("populates the bar chart on slide 0 when getDetectionData returns data (Neutral series appended)", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: {
        statusCode: 200,
        body: {
          data: {
            face_recognition: [10, 20, 30, 40, 50, 60, 70],
            object_detection: [5, 5, 5, 5, 5, 5, 5],
          },
        },
      },
    });
    await act(async () => {
      render(<ActivityChart />);
    });
    // Move to slide 0 (Activity)
    fireEvent.click(screen.getByLabelText("Previous chart"));
    expect(screen.getByTestId("apex-chart")).toBeInTheDocument();
    // 2 source keys + 1 Neutral series appended = 3.
    expect(screen.getByTestId("apex-series-count")).toHaveTextContent("3");
    // Verify Neutral series math: totalPerDay = [15, 25, 35, 45, 55, 65, 75]
    // -> neutral = [85, 75, 65, 55, 45, 35, 25].
    const series = apexProps.value.series;
    expect(series).toHaveLength(3);
    const neutral = series.find((s) => s.name === "Neutral");
    expect(neutral).toBeTruthy();
    expect(neutral.data).toEqual([85, 75, 65, 55, 45, 35, 25]);
    // The first series name should be the formatted key label.
    expect(series[0].name).toBe("Face Recognition");
  });

  it("clicks Next arrow from comparison -> wraps back to slide 0 (activity)", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: { statusCode: 200, body: { data: {} } },
    });
    await act(async () => {
      render(<ActivityChart />);
    });
    // Initial = 1 (comparison). Next -> 0 (activity, mod 2).
    fireEvent.click(screen.getByLabelText("Next chart"));
    expect(
      screen.getByText("AI Detection Activity Over the Past Week")
    ).toBeInTheDocument();
    // Comparison child is no longer mounted.
    expect(screen.queryByTestId("comparison-chart")).toBeNull();
  });

  it("goes to a specific slide via pagination-dot click (goToChart)", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: { statusCode: 200, body: { data: {} } },
    });
    await act(async () => {
      render(<ActivityChart />);
    });
    // Two pagination dots labelled "Go to chart 1" / "Go to chart 2".
    fireEvent.click(screen.getByLabelText("Go to chart 1"));
    expect(
      screen.getByText("AI Detection Activity Over the Past Week")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Go to chart 2"));
    expect(
      screen.getByText("Multi-Camera Activity Review & Comparison")
    ).toBeInTheDocument();
  });

  it("resets series to [] when the API returns a non-200 status (no chart, empty-state on activity slide)", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: { statusCode: 500, body: { data: {} } },
    });
    await act(async () => {
      render(<ActivityChart />);
    });
    fireEvent.click(screen.getByLabelText("Previous chart"));
    expect(screen.getByText("No detection found")).toBeInTheDocument();
    expect(screen.queryByTestId("apex-chart")).toBeNull();
  });

  it("resets series to [] when getDetectionData rejects (catch branch)", async () => {
    getDetectionDataMock.mockRejectedValue(new Error("boom"));
    await act(async () => {
      render(<ActivityChart />);
    });
    // Activity slide -> empty-state pane (since rejection -> series=[])
    fireEvent.click(screen.getByLabelText("Previous chart"));
    expect(screen.getByText("No detection found")).toBeInTheDocument();
  });

  it("re-fetches when nvrId / department / location change", async () => {
    getDetectionDataMock.mockResolvedValue({
      data: { statusCode: 200, body: { data: {} } },
    });
    const { rerender } = render(<ActivityChart nvrId="a" />);
    // Wait microtask for the initial fetch.
    await act(async () => {});
    const firstCalls = getDetectionDataMock.mock.calls.length;
    expect(firstCalls).toBeGreaterThanOrEqual(1);
    await act(async () => {
      rerender(<ActivityChart nvrId="b" />);
    });
    expect(getDetectionDataMock.mock.calls.length).toBeGreaterThan(firstCalls);
    const after2 = getDetectionDataMock.mock.calls.length;
    await act(async () => {
      rerender(<ActivityChart nvrId="b" department="x" />);
    });
    expect(getDetectionDataMock.mock.calls.length).toBeGreaterThan(after2);
    const after3 = getDetectionDataMock.mock.calls.length;
    await act(async () => {
      rerender(<ActivityChart nvrId="b" department="x" location="y" />);
    });
    expect(getDetectionDataMock.mock.calls.length).toBeGreaterThan(after3);
  });

  it("renders Skeleton placeholders while loading (title + chart area + chevrons + dots)", async () => {
    // Never-resolving promise keeps loading=true.
    let resolveIt;
    getDetectionDataMock.mockReturnValue(
      new Promise((res) => {
        resolveIt = res;
      })
    );
    render(<ActivityChart />);
    // At least one skeleton placeholder is present while loading.
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
    // Has circle-skeleton chevrons in the loading branch (one True for circle).
    const circles = skeletons.filter(
      (s) => s.getAttribute("data-circle") === "true"
    );
    expect(circles.length).toBeGreaterThanOrEqual(1);
    // Resolve to release the dangling promise (avoid unhandled rejection).
    await act(async () => {
      resolveIt({ data: { statusCode: 200, body: { data: {} } } });
    });
  });
});
