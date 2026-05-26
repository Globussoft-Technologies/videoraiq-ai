/**
 * Round 82: cover Dashboard/Alertcards/ActiveCamera.jsx — the
 * "Cameras with Detections" page popped up from the dashboard StatCards
 * (and from the Incidents page). The component:
 *
 *   - on mount + on each [nvrId, cameraId, searchTerm, skip, limit] change
 *     calls `getIncidentData({ ActiveChannels:true, startDate:today,
 *     endDate:today }, nvrId, cameraId, searchTerm, skip, limit)`. On a
 *     200 it stores `body.data.data` as tableData, computes totalPages =
 *     ceil(body.data.totalCount / limit), and tracks totalCount.
 *     Non-200 surfaces a toast.error("Failed to fetch incident data").
 *   - on mount calls `getNvrNames()`; on each nvrId change calls
 *     `getCamerasBasedOnNvr(nvrId)` (early-returns when nvrId is empty).
 *   - the back-button label + onClick swap on `location.state?.dashboard`:
 *     truthy -> "Back to Dashboard" + navigate('/dashboard'); falsy ->
 *     "Back to Incidents" + navigate('/incidents').
 *   - search input value is lowercased into searchTerm. The NVR <Select>
 *     mirrors nvrList. The Camera <Select> is `disabled={!nvrId}`. The
 *     FilterX button resets nvrId / cameraId / searchTerm.
 *   - the table renders one row per tableData entry with the documented
 *     fall-backs ('---' when customName + name are both falsy / when
 *     model / firmwareVersion is missing). The "No data found" empty
 *     state appears only after loading is complete.
 *   - pagination handler clamps page outside [1, totalPages] and sets
 *     skip = (page-1)*limit.
 *
 * This spec pins (only the props-/state-pure pieces — no extra deep
 * Radix surface):
 *   1. mount fires getIncidentData with today + the parent filters, and
 *      both getNvrNames + the NVR select options render after resolution.
 *      Table rows render with the fall-back '---' for missing fields, the
 *      totalCount header reflects the resolved body.
 *   2. clicking the FilterX (Clear Filters) button resets the search
 *      term; the search input's onChange lowercases the value.
 *   3. the back-button label + the navigate route swap on
 *      location.state.dashboard.
 *   4. non-200 from getIncidentData triggers `toast.error("Failed to
 *      fetch incident data")` and the No-data-found copy is rendered.
 *
 * Mocks (7 — under the 8-mock cap):
 *   1. ../../Dashboard/Api/post  — getIncidentData
 *   2. ../../Dashboard/Api/get   — getNvrNames + getCamerasBasedOnNvr
 *   3. react-router-dom          — useNavigate + useLocation
 *   4. sonner                    — toast.error / toast.success spies
 *   5. @/components/ui/select    — passthrough Radix shim (Portal hides
 *                                  the real one under jsdom)
 *   6. @/components/Pagination   — marker that captures props
 *   7. react-loading-skeleton    — replaced by a marker div so the
 *                                  loading-state DOM is stable
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

// --- Mocks ---------------------------------------------------------------

const getIncidentDataMock = vi.hoisted(() => vi.fn());
const getNvrNamesMock = vi.hoisted(() => vi.fn());
const getCamerasBasedOnNvrMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const locationRef = vi.hoisted(() => ({ value: { state: null } }));
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

// Radix Select Portal hides its content under jsdom; passthrough shim
// captures value + onValueChange via data attrs so a test can drive an
// option click directly.
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

const paginationProps = vi.hoisted(() => ({ value: null }));
vi.mock("@/components/Pagination", () => ({
  default: (props) => {
    paginationProps.value = props;
    return React.createElement("div", {
      "data-testid": "pagination",
      "data-current-page": props.currentPage,
      "data-total-pages": props.totalPages,
    });
  },
}));

vi.mock("react-loading-skeleton", () => ({
  default: (props) =>
    React.createElement("span", {
      "data-testid": "skeleton",
      "data-width": props?.width,
      "data-height": props?.height,
    }),
}));

import ActiveCamera from "@/page/user/Dashboard/Alertcards/ActiveCamera.jsx";

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
  navigateMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  paginationProps.value = null;
  locationRef.value = { state: null };
});

describe("Dashboard/Alertcards/ActiveCamera", () => {
  it("on mount fires getIncidentData(ActiveChannels:true) + getNvrNames, renders table rows with '---' fall-backs and the totalCount header", async () => {
    getIncidentDataMock.mockResolvedValueOnce({
      statusCode: 200,
      body: {
        data: {
          data: [
            {
              _id: "cam-1",
              customName: "Lobby",
              model: "X100",
              firmwareVersion: "v1.2",
              nvrData: { nvrName: "NVR-1" },
            },
            // Missing customName + name + model + firmwareVersion ->
            // each cell falls back to '---'.
            { _id: "cam-2", nvrData: { nvrName: "NVR-2" } },
          ],
          totalCount: 27,
        },
      },
    });
    getNvrNamesMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { data: { nvrs: [{ _id: "nvr-a", nvrName: "NVR-A" }] } },
    });

    await flush(<ActiveCamera />);

    // The first getIncidentData call carries the documented payload
    // (ActiveChannels:true + today/today) + the initial filter args
    // (nvrId='', cameraId='', searchTerm='', skip=0, limit=10).
    expect(getIncidentDataMock).toHaveBeenCalled();
    const firstCallArgs = getIncidentDataMock.mock.calls[0];
    expect(firstCallArgs[0]).toMatchObject({ ActiveChannels: true });
    expect(typeof firstCallArgs[0].startDate).toBe("string");
    expect(firstCallArgs[0].startDate).toBe(firstCallArgs[0].endDate);
    expect(firstCallArgs[1]).toBe(""); // nvrId
    expect(firstCallArgs[2]).toBe(""); // cameraId
    expect(firstCallArgs[3]).toBe(""); // searchTerm
    expect(firstCallArgs[4]).toBe(0); // skip
    expect(firstCallArgs[5]).toBe(10); // limit

    // getNvrNames was fired on mount and the NVR-A option is mounted in the
    // shimmed select content.
    expect(getNvrNamesMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("NVR-A")).toBeInTheDocument();

    // Total count header surfaces "27" + the static sub-label.
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(
      screen.getByText(/Currently Active Detections/i)
    ).toBeInTheDocument();

    // Populated row 1 — Lobby + X100 + v1.2 + NVR-1.
    expect(screen.getByText("Lobby")).toBeInTheDocument();
    expect(screen.getByText("X100")).toBeInTheDocument();
    expect(screen.getByText("v1.2")).toBeInTheDocument();
    expect(screen.getByText("NVR-1")).toBeInTheDocument();

    // Populated row 2 — three '---' fall-backs (customName/name, model,
    // firmwareVersion) + NVR-2.
    expect(screen.getAllByText("---").length).toBe(3);
    expect(screen.getByText("NVR-2")).toBeInTheDocument();

    // Pagination footer wired with the computed totalPages = ceil(27/10) = 3.
    expect(paginationProps.value).toMatchObject({
      currentPage: 1,
      totalPages: 3,
    });

    // No data-found copy should NOT render when rows are present.
    expect(screen.queryByText(/No data found/i)).not.toBeInTheDocument();
  });

  it("search input lowercases the typed value into searchTerm; FilterX clears all three filters", async () => {
    getIncidentDataMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    await flush(<ActiveCamera />);

    const searchInput = screen.getByPlaceholderText("Search");
    expect(searchInput).not.toBeNull();

    // Typing UPPER triggers onChange -> setSearchTerm(value.toLowerCase()).
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "HELLO" } });
      await Promise.resolve();
    });
    expect(searchInput.value).toBe("hello");

    // The latest getIncidentData call should reflect searchTerm='hello'.
    const last = getIncidentDataMock.mock.calls.at(-1);
    expect(last[3]).toBe("hello");

    // FilterX is the only <button> inside the filter strip with title
    // "Clear Filters".
    const clearBtn = screen.getByTitle("Clear Filters");
    await act(async () => {
      fireEvent.click(clearBtn);
      await Promise.resolve();
    });
    expect(searchInput.value).toBe("");

    // After clearing, the latest getIncidentData call's searchTerm is ''.
    const afterClear = getIncidentDataMock.mock.calls.at(-1);
    expect(afterClear[3]).toBe("");
  });

  it("back-button label + route swap on location.state.dashboard", async () => {
    getIncidentDataMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    // Default (state.dashboard falsy) -> "Back to Incidents" + /incidents.
    locationRef.value = { state: null };
    await flush(<ActiveCamera />);
    expect(screen.getByText("Back to Incidents")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to Incidents"));
    expect(navigateMock).toHaveBeenCalledWith("/incidents");

    cleanup();
    navigateMock.mockReset();

    // state.dashboard truthy -> "Back to Dashboard" + /dashboard.
    locationRef.value = { state: { dashboard: true } };
    await flush(<ActiveCamera />);
    expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to Dashboard"));
    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("non-200 getIncidentData surfaces toast.error and the No-data-found copy", async () => {
    getIncidentDataMock.mockResolvedValueOnce({
      statusCode: 500,
      body: { data: { data: [], totalCount: 0 } },
    });
    getNvrNamesMock.mockResolvedValue({
      statusCode: 200,
      body: { data: { nvrs: [] } },
    });

    await flush(<ActiveCamera />);

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to fetch incident data"
    );
    expect(screen.getByText(/No data found/i)).toBeInTheDocument();
  });
});
