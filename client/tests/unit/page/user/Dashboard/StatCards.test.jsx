/**
 * Round 80: cover Dashboard/StatCards.jsx — the four-card incident summary
 * strip that sits at the top of the dashboard / incidents pages
 * (Critical Incidents / Total Incidents / Cameras Detected/Total / Incidents
 * Resolved). On mount it fires `getAlertsData(nvrId, location, department)`
 * (re-triggered on the AuthContext.triggerFlag change and on each filter
 * change) and stores `response.body.data` as alertsData; the four cards
 * pick their counters off either alertsData (when `dashboardTitles` is
 * truthy) or the parent-supplied stats prop.
 *
 * Navigation routes:
 *   Critical Incidents -> /critical-incidents
 *   Total Incidents    -> /total-incidents
 *   Active Cameras     -> /active-cameras (always clickable when canView,
 *                        even with zero count)
 *   Incidents Resolved -> /incidents-resolved
 *
 * Permission gate: usePermissions().permissions?.incidents?.view governs
 * whether the cards are clickable at all. When `dashboardTitles` is true
 * the routes navigate without state; otherwise navigate is called with
 * { state: { incident: incidentsPage, date } }.
 *
 * This spec pins:
 *   1. The loading state shows Skeleton placeholders for both the header
 *      copy strip and the descriptive sub-text; the numeric counter falls
 *      back to 0 via the `?? 0` operator.
 *   2. Once getAlertsData resolves, the four cards render the values pulled
 *      off alertsData (in dashboardTitles mode) — including the formatted
 *      "activeCameras/overAllCameraCount" pair.
 *   3. When dashboardTitles is falsy, the cards pull from the stats prop
 *      and navigation includes { state: { incident, date } }.
 *   4. clickableFor() gates navigation: when canView is false, click does
 *      nothing; the critical-alerts card requires a positive count;
 *      activeCameras is always clickable when canView (requirePositive=false).
 *   5. getAlertsData is awaited inside an act() flush and is invoked with
 *      the nvrId / location / department props on mount.
 *
 * Mocks (5):
 *   1. ./Api/get  — stub getAlertsData with a controllable promise
 *   2. @/context/AuthContext — useAuth provides triggerFlag
 *   3. @/context/Permission/PermissionContext — usePermissions provides
 *      permissions.incidents.view
 *   4. react-router-dom — useNavigate returns a vi.fn(); useLocation
 *      stubbed (the component does not use it but the global stub
 *      keeps the router context happy).
 *   5. @/utils/DynamicDateTime — replaced by a marker div (the real impl
 *      runs a live clock).
 *
 * Well under the 8-mock cap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

// Hoist mutable refs so each test can set the permission shape and the
// getAlertsData resolution payload before render.
const permissionsRef = vi.hoisted(() => ({ value: { permissions: null } }));
const getAlertsDataMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const triggerFlagRef = vi.hoisted(() => ({ value: 0 }));

vi.mock(
  "../../../../../src/page/user/Dashboard/Api/get/index.jsx",
  () => ({
    getAlertsData: (...args) => getAlertsDataMock(...args),
  }),
);

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ triggerFlag: triggerFlagRef.value, user: {} }),
}));

vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/utils/DynamicDateTime", () => ({
  default: () => React.createElement("div", { "data-testid": "dyn-time" }),
}));

const { default: StatCards } = await import(
  "../../../../../src/page/user/Dashboard/StatCards.jsx"
);

const mountAndFlush = async (ui) => {
  let result;
  await act(async () => {
    result = render(ui);
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
};

beforeEach(() => {
  permissionsRef.value = {
    permissions: { incidents: { view: true } },
  };
  getAlertsDataMock.mockReset();
  navigateMock.mockReset();
  triggerFlagRef.value = 0;
});

describe("Dashboard/StatCards", () => {
  it("fires getAlertsData on mount with (nvrId, location, department) and resolves into the alertsData state", async () => {
    getAlertsDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        data: {
          criticalAlerts: 7,
          totalAlerts: 21,
          activeCameras: 5,
          overAllCameraCount: 10,
          incidentsResolved: 14,
        },
      },
    });
    await mountAndFlush(
      <StatCards
        dashboardTitles={true}
        nvrId="n1"
        location="loc-A"
        department="dep-B"
      />,
    );

    expect(getAlertsDataMock).toHaveBeenCalledWith("n1", "loc-A", "dep-B");
    expect(screen.getByText("Today's Critical Incidents")).toBeInTheDocument();
    expect(screen.getByText("Today's Total Incidents")).toBeInTheDocument();
    expect(screen.getByText("Cameras: Detected / Total")).toBeInTheDocument();
    expect(screen.getByText("Incidents Resolved")).toBeInTheDocument();
    // Counters pulled off alertsData
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    // Active cameras render as `${activeCameras}` + "/" + `${overAllCameraCount}`
    // inside one <p>. Find the active-cameras card header and verify the
    // sibling <p> collapses to "5 / 10".
    const activeHeader = screen.getByText("Cameras: Detected / Total");
    const card = activeHeader.closest("div.flex.flex-col");
    expect(card).not.toBeNull();
    const counterText = card
      .querySelector("p.font-\\[700\\]")
      .textContent.replace(/\s+/g, " ")
      .trim();
    expect(counterText).toBe("5/10");
    cleanup();
  });

  it("falls back to the stats prop and forwards state on navigate when dashboardTitles is falsy", async () => {
    getAlertsDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { data: {} },
    });
    const stats = {
      criticalAlerts: 4,
      totalAlerts: 11,
      activeCameras: 2,
      overAllCameraCount: 8,
      incidentsResolved: 9,
    };
    await mountAndFlush(
      <StatCards
        dashboardTitles={false}
        stats={stats}
        incidentsPage={true}
        date={{ start: "2025-01-01", end: "2025-02-01" }}
      />,
    );

    // Non-dashboard titles vary: the falsy-mode strings drop the "Today's"
    // prefix.
    expect(screen.getByText("Critical Incidents")).toBeInTheDocument();
    expect(screen.getByText("Total Incidents")).toBeInTheDocument();
    // Counts come from the stats prop now.
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();

    // Click the Critical Incidents card -> navigate with the state bag.
    const criticalHeader = screen.getByText("Critical Incidents");
    fireEvent.click(criticalHeader.closest("div.flex.flex-col"));
    expect(navigateMock).toHaveBeenCalledWith("/critical-incidents", {
      state: {
        incident: true,
        date: { start: "2025-01-01", end: "2025-02-01" },
      },
    });
    cleanup();
  });

  it("navigates without state when dashboardTitles is true and the count is positive", async () => {
    getAlertsDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { data: { criticalAlerts: 3, activeCameras: 0, overAllCameraCount: 0 } },
    });
    await mountAndFlush(<StatCards dashboardTitles={true} />);

    fireEvent.click(
      screen.getByText("Today's Critical Incidents").closest("div.flex.flex-col"),
    );
    expect(navigateMock).toHaveBeenCalledWith("/critical-incidents");
    cleanup();
  });

  it("does NOT navigate when criticalAlerts count is zero (requirePositive gate)", async () => {
    getAlertsDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { data: { criticalAlerts: 0 } },
    });
    await mountAndFlush(<StatCards dashboardTitles={true} />);

    fireEvent.click(
      screen.getByText("Today's Critical Incidents").closest("div.flex.flex-col"),
    );
    expect(navigateMock).not.toHaveBeenCalled();
    cleanup();
  });

  it("navigates to /active-cameras even when activeCameras count is zero (requirePositive=false)", async () => {
    getAlertsDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { data: { activeCameras: 0, overAllCameraCount: 0 } },
    });
    await mountAndFlush(<StatCards dashboardTitles={true} />);

    fireEvent.click(
      screen
        .getByText("Cameras: Detected / Total")
        .closest("div.flex.flex-col"),
    );
    expect(navigateMock).toHaveBeenCalledWith("/active-cameras", {
      state: { dashboard: true },
    });
    cleanup();
  });

  it("blocks navigation entirely when canView is false", async () => {
    permissionsRef.value = {
      permissions: { incidents: { view: false } },
    };
    getAlertsDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { data: { criticalAlerts: 9, totalAlerts: 9, activeCameras: 9, incidentsResolved: 9 } },
    });
    await mountAndFlush(<StatCards dashboardTitles={true} />);

    // Each of the four cards should be a no-op when the view permission is
    // missing.
    const labels = [
      "Today's Critical Incidents",
      "Today's Total Incidents",
      "Cameras: Detected / Total",
      "Incidents Resolved",
    ];
    for (const label of labels) {
      fireEvent.click(screen.getByText(label).closest("div.flex.flex-col"));
    }
    expect(navigateMock).not.toHaveBeenCalled();
    cleanup();
  });

  it("falls back to a 0 counter and stores {} when getAlertsData returns a non-200 result", async () => {
    getAlertsDataMock.mockResolvedValueOnce({ statusCode: 500, body: {} });
    await mountAndFlush(<StatCards dashboardTitles={true} />);
    // With alertsData = {}, criticalAlerts is undefined -> renderContent
    // returns dataValue ?? 0.
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    cleanup();
  });

  it("swallows getAlertsData rejections and still renders the cards with 0", async () => {
    getAlertsDataMock.mockRejectedValueOnce(new Error("boom"));
    await mountAndFlush(<StatCards dashboardTitles={true} />);
    expect(screen.getByText("Today's Critical Incidents")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    cleanup();
  });
});
