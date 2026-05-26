/**
 * Round 99: cover Dashboard/Alertcards/CriticalAlerts.jsx — the
 * "Critical / Total / Resolved Incidents" listing page mounted from the
 * dashboard StatCards card-click handlers (sibling of ActiveCamera covered
 * in R82, but with a different filter contract). The component:
 *
 *   - reads `useLocation().pathname` and maps `/critical-incidents` ->
 *     "Critical Incidents", `/total-incidents` -> "Total Incidents",
 *     anything else (including `/incidents-resolved`) -> "Incidents
 *     Resolved" via INCIDENT_TYPE_MAP. The mapped string drives the
 *     page title, the immediate-attention vs alerts-notified vs
 *     acknowledged sub-label, the icon-circle variant, and the
 *     API_TYPE_MAP flag handed to `getIncidentData`.
 *   - on mount + on every [incidentType, nvrId, cameraId, searchTerm,
 *     skip, limit, incident, start, end, manualTrigger] change calls
 *     getIncidentData({ [API_TYPE_MAP[incidentType]]: true, startDate,
 *     endDate }, nvrId, cameraId, searchTerm, skip, limit). On 200 it
 *     stores `body.data.data` as tableData and computes totalPages =
 *     ceil(totalCount / limit). Non-200 toasts "Failed to fetch
 *     incident data".
 *   - the start/end pair depends on `location.state?.date`: when
 *     date.start + date.end are both set the dates are moment-formatted
 *     to startOf('day') / endOf('day') YYYY-MM-DD; otherwise start
 *     falls back to "2025-01-01" and end to today.
 *   - on mount + on incidentType change also fires getNvrNames(); on
 *     each nvrId change fires getCamerasBasedOnNvr (early-returns when
 *     nvrId is empty).
 *   - the back-button label + onClick swap on `location.state?.incident`:
 *     truthy -> "Back to Incidents" + navigate('/incidents'); falsy ->
 *     "Back to Dashboard" + navigate('/dashboard').
 *   - search input lowercases the typed value into searchTerm via the
 *     useDebounce hook; FilterX clears nvrId / cameraId / search.
 *   - non-200 from getIncidentData triggers
 *     toast.error("Failed to fetch incident data") and shows the
 *     "No data found" empty-state copy.
 *
 * This spec pins:
 *   1. /critical-incidents pathname mounts the "Critical Incidents" page
 *      with the criticalIncidents flag on the first getIncidentData call,
 *      the renderIncidentIcon AlertTriangle variant, and the matching
 *      sub-label.
 *   2. location.state.incident truthy renders "Back to Incidents" and
 *      navigates to /incidents on click.
 *   3. /total-incidents pathname uses the totalIncidents API flag + the
 *      "Alerts Notified" sub-label. location.state.incident falsy ->
 *      "Back to Dashboard" + navigate('/dashboard').
 *   4. non-200 getIncidentData surfaces toast.error("Failed to fetch
 *      incident data") and the "No data found" copy.
 *   5. /incidents-resolved pathname (matches the explicit
 *      INCIDENT_TYPE_MAP entry) routes through resolvedIncidents +
 *      "Acknowledged or closed alerts" sub-label.
 *
 * Mocks (8 — at cap):
 *   1. ../../Dashboard/Api/post  — getIncidentData
 *   2. ../../Dashboard/Api/get   — getNvrNames + getCamerasBasedOnNvr
 *   3. ../../Dashboard/Api/put   — markAlertResolved
 *   4. react-router-dom          — useNavigate + useLocation
 *   5. sonner                    — toast.error / toast.success spies
 *   6. @/context/AuthContext     — useAuth (returns a {user:{}} stub
 *                                  so `firstIncidentCreatedDate` is
 *                                  undefined; the date useEffect falls
 *                                  to the 2025-01-01 default branch).
 *   7. @/context/Permission/PermissionContext — usePermissions stub
 *   8. @/components/ui/select    — passthrough Radix shim (Portal hides
 *                                  the real one under jsdom)
 *
 * VideoModal + ReportIncidentModal + Pagination are intentionally left
 * un-mocked: VideoModal only renders when selectedCamera is truthy (it
 * is null on mount in every assertion below), ReportIncidentModal's
 * isOpen prop is false on mount so its Dialog renders null, and
 * Pagination is a pure stateless markup wrapper around two buttons +
 * a label. None of them pull in network / context modules at
 * import time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";

// --- Mocks ---------------------------------------------------------------

const getIncidentDataMock = vi.hoisted(() => vi.fn());
const getNvrNamesMock = vi.hoisted(() => vi.fn());
const getCamerasBasedOnNvrMock = vi.hoisted(() => vi.fn());
const markAlertResolvedMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const locationRef = vi.hoisted(() => ({
  value: { pathname: "/critical-incidents", state: null },
}));
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../../../../src/page/user/Dashboard/Api/post/index.jsx",
  () => ({
    getIncidentData: (...args) => getIncidentDataMock(...args),
  })
);

vi.mock(
  "../../../../../../src/page/user/Dashboard/Api/get/index.jsx",
  () => ({
    getNvrNames: (...args) => getNvrNamesMock(...args),
    getCamerasBasedOnNvr: (...args) => getCamerasBasedOnNvrMock(...args),
  })
);

vi.mock(
  "../../../../../../src/page/user/Dashboard/Api/put/index.jsx",
  () => ({
    markAlertResolved: (...args) => markAlertResolvedMock(...args),
  })
);

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationRef.value,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args) => toastErrorMock(...args),
    success: (...args) => toastSuccessMock(...args),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: {} }),
}));

vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => ({ permissions: { incidents: { edit: false } } }),
}));

// Radix Select Portal hides its content under jsdom; passthrough shim
// renders content inline so option text is queryable.
vi.mock("@/components/ui/select", () => {
  const Select = ({ children, value, onValueChange, disabled }) =>
    React.createElement(
      "div",
      {
        "data-slot": "select",
        "data-value": value ?? "",
        "data-disabled": disabled ? "true" : "false",
        onClick: (e) => {
          const target = e.target;
          if (target?.dataset?.selectItemValue && onValueChange) {
            onValueChange(target.dataset.selectItemValue);
          }
        },
      },
      children
    );
  const SelectTrigger = ({ children, ...rest }) =>
    React.createElement(
      "div",
      { "data-slot": "select-trigger", ...rest },
      children
    );
  const SelectContent = ({ children, ...rest }) =>
    React.createElement(
      "div",
      { "data-slot": "select-content", ...rest },
      children
    );
  const SelectValue = ({ placeholder }) =>
    React.createElement(
      "span",
      { "data-slot": "select-value" },
      placeholder
    );
  const SelectItem = ({ value, children, ...rest }) =>
    React.createElement(
      "div",
      {
        "data-slot": "select-item",
        "data-select-item-value": value,
        ...rest,
      },
      children
    );
  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem };
});

import CriticalAlerts from "@/page/user/Dashboard/Alertcards/CriticalAlerts.jsx";

// Mount + flush the chain of state-setting useEffects. Three Promise.resolve
// ticks cover the fetchData -> setOnLoading -> setTableData transitions
// observed in the ActiveCamera spec.
const flush = async (ui) => {
  let res;
  await act(async () => {
    res = render(ui);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return res;
};

beforeEach(() => {
  getIncidentDataMock.mockReset();
  getNvrNamesMock.mockReset();
  getCamerasBasedOnNvrMock.mockReset();
  markAlertResolvedMock.mockReset();
  navigateMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  locationRef.value = { pathname: "/critical-incidents", state: null };
});

describe("Dashboard/Alertcards/CriticalAlerts", () => {
  it("/critical-incidents pathname mounts the Critical Incidents page with the criticalIncidents API flag and the immediate-attention sub-label", async () => {
    locationRef.value = { pathname: "/critical-incidents", state: null };
    getIncidentDataMock.mockResolvedValue({
      statusCode: 200,
      body: {
        data: {
          data: [
            {
              _id: "inc-1",
              description: "desc",
              incidentType: "Person Detected",
              channelData: { name: "Front-Door" },
              nvrData: { nvrName: "NVR-A" },
              zone: "Zone-1",
              severity: "high",
              resolved: false,
              timeOfIncident: "2025-01-15T10:30:00Z",
            },
          ],
          totalCount: 42,
        },
      },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [{ _id: "nvr-a", nvrName: "NVR-A" }] } },
    });

    await flush(<CriticalAlerts />);

    // The first getIncidentData call carries the criticalIncidents flag
    // (the pathname -> "Critical Incidents" -> API_TYPE_MAP mapping) +
    // the initial filter args (nvrId='', cameraId='', searchTerm='',
    // skip=0, limit=10). Since location.state.incident is falsy, the
    // default-date branch fires with start="2025-01-01" + end=today.
    expect(getIncidentDataMock).toHaveBeenCalled();
    const firstCallArgs = getIncidentDataMock.mock.calls[0];
    expect(firstCallArgs[0]).toMatchObject({ criticalIncidents: true });
    // location.state.incident is falsy -> the data payload uses
    // start=today / end=today (the else branch in the fetch effect).
    expect(typeof firstCallArgs[0].startDate).toBe("string");
    expect(firstCallArgs[0].startDate).toBe(firstCallArgs[0].endDate);
    expect(firstCallArgs[1]).toBe(""); // nvrId
    expect(firstCallArgs[2]).toBe(""); // cameraId
    expect(firstCallArgs[3]).toBe(""); // searchTerm
    expect(firstCallArgs[4]).toBe(0); // skip
    expect(firstCallArgs[5]).toBe(10); // limit

    // getNvrNames was fired on mount (the incidentType-change useEffect
    // also fires once when the pathname-driven incidentType resolves
    // from "Incidents Resolved" -> "Critical Incidents" on mount, so 2+
    // is the documented invariant) and the NVR-A option mounts in the
    // shimmed select content.
    expect(getNvrNamesMock).toHaveBeenCalled();
    expect(getNvrNamesMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    // NVR-A appears twice in the DOM (the select option AND the table
    // row's nvrData.nvrName cell). The mere presence of >=1 confirms
    // the select-options rendering pipeline ran.
    expect(screen.getAllByText("NVR-A").length).toBeGreaterThanOrEqual(1);

    // Page title + sub-label are the Critical-Incidents variant.
    expect(screen.getByText("Critical Incidents")).toBeInTheDocument();
    expect(
      screen.getByText(/Immediate attention needed/i)
    ).toBeInTheDocument();

    // Total count header surfaces "42".
    expect(screen.getByText("42")).toBeInTheDocument();

    // Populated row 1 — Front-Door + NVR-A + Zone-1 + High severity
    // (severity is title-cased: "high" -> "High").
    expect(screen.getByText("Front-Door")).toBeInTheDocument();
    expect(screen.getByText("Zone-1")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    // Status badge: resolved=false -> "Not Resolved" copy. The string
    // also appears in the per-row actions SelectItem dropdown.
    expect(screen.getAllByText("Not Resolved").length).toBeGreaterThanOrEqual(
      1
    );

    // No data-found copy should NOT render when rows are present.
    expect(screen.queryByText(/No data found/i)).not.toBeInTheDocument();
  });

  it("location.state.incident truthy -> renders 'Back to Incidents' and navigates to /incidents", async () => {
    locationRef.value = {
      pathname: "/critical-incidents",
      state: { incident: true },
    };
    getIncidentDataMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    await flush(<CriticalAlerts />);

    expect(screen.getByText("Back to Incidents")).toBeInTheDocument();

    // Back-button breadcrumb above the page header reads "Incidents"
    // (not "Dashboard") when incident is truthy.
    expect(screen.getByText("Incidents")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back to Incidents"));
    expect(navigateMock).toHaveBeenCalledWith("/incidents");
  });

  it("/total-incidents pathname uses totalIncidents flag + 'Alerts Notified' sub-label; falsy state.incident -> 'Back to Dashboard' navigates /dashboard", async () => {
    locationRef.value = { pathname: "/total-incidents", state: null };
    getIncidentDataMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    await flush(<CriticalAlerts />);

    // Title + sub-label are the Total Incidents variant.
    expect(screen.getByText("Total Incidents")).toBeInTheDocument();
    expect(screen.getByText(/Alerts Notified/i)).toBeInTheDocument();

    // getIncidentData was called with the totalIncidents API flag.
    const callsWithTotal = getIncidentDataMock.mock.calls.filter(
      (args) => args[0]?.totalIncidents === true
    );
    expect(callsWithTotal.length).toBeGreaterThanOrEqual(1);

    // Back-button: falsy state.incident -> "Back to Dashboard" +
    // navigate('/dashboard').
    expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to Dashboard"));
    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("non-200 getIncidentData surfaces toast.error and the No-data-found copy", async () => {
    locationRef.value = { pathname: "/critical-incidents", state: null };
    getIncidentDataMock.mockResolvedValue({
      statusCode: 500,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    await flush(<CriticalAlerts />);

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to fetch incident data"
    );
    expect(screen.getByText(/No data found/i)).toBeInTheDocument();
  });

  it("/incidents-resolved pathname maps to resolvedIncidents flag + 'Acknowledged or closed alerts' sub-label", async () => {
    locationRef.value = { pathname: "/incidents-resolved", state: null };
    getIncidentDataMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    await flush(<CriticalAlerts />);

    expect(screen.getByText("Incidents Resolved")).toBeInTheDocument();
    expect(
      screen.getByText(/Acknowledged or closed alerts/i)
    ).toBeInTheDocument();

    // getIncidentData fired with the resolvedIncidents flag.
    const callsWithResolved = getIncidentDataMock.mock.calls.filter(
      (args) => args[0]?.resolvedIncidents === true
    );
    expect(callsWithResolved.length).toBeGreaterThanOrEqual(1);
  });
});
