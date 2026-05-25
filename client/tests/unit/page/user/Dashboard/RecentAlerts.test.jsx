/**
 * src/page/user/Dashboard/RecentAlerts.jsx — small presentational card that
 * renders a fixed Walmart-Store header + a fixed alert image + four hard-
 * coded camera chips + the two heavy children (AlertGauge / ActivityChart).
 *
 * The two children are mocked because their real implementations pull in
 * UserContext, sockets, apexcharts, the auth context, API modules, etc.
 * Everything else in RecentAlerts is static markup, so this spec just
 * pins the visible labels + the chip count + that the (mocked) children
 * actually mount.
 *
 * Mocks (2):
 *   1. ./AlertGauge      — replaced by a simple <div data-testid="gauge" />
 *   2. ./ActivityChart   — replaced by a simple <div data-testid="activity" />
 *
 * Well under the 8-mock cap.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../../src/page/user/Dashboard/AlertGauge.jsx", () => ({
  default: () => <div data-testid="alert-gauge" />,
}));
vi.mock("../../../../../src/page/user/Dashboard/ActivityChart.jsx", () => ({
  default: () => <div data-testid="activity-chart" />,
}));

const { default: RecentAlerts } = await import(
  "../../../../../src/page/user/Dashboard/RecentAlerts.jsx"
);

describe("Dashboard/RecentAlerts", () => {
  it("renders the static Walmart-Store header copy (title, sub-title, timestamp, risk badge)", () => {
    render(<RecentAlerts />);
    expect(screen.getByText("Walmart Store")).toBeInTheDocument();
    expect(screen.getByText("NYC")).toBeInTheDocument();
    expect(screen.getByText("15 May 2025, 11:45 AM")).toBeInTheDocument();
    expect(screen.getByText("High Risk Alert")).toBeInTheDocument();
  });

  it("renders the surveillance image with the documented alt text", () => {
    render(<RecentAlerts />);
    const img = screen.getByAltText("Retail surveillance");
    expect(img.tagName).toBe("IMG");
    // The component hard-codes a Pexels asset URL — pin it so a silent
    // swap to a different host is caught.
    expect(img.getAttribute("src")).toMatch(/pexels-photo-3205570/);
  });

  it("renders exactly four camera chips, in order Cam 1..Cam 4", () => {
    render(<RecentAlerts />);
    const chips = ["Cam 1", "Cam 2", "Cam 3", "Cam 4"].map((label) =>
      screen.getByText(label)
    );
    expect(chips).toHaveLength(4);
    // Each chip must actually be present in the DOM.
    chips.forEach((c) => expect(c).toBeInTheDocument());
  });

  it("mounts both heavy children (AlertGauge + ActivityChart)", () => {
    render(<RecentAlerts />);
    expect(screen.getByTestId("alert-gauge")).toBeInTheDocument();
    expect(screen.getByTestId("activity-chart")).toBeInTheDocument();
  });
});
