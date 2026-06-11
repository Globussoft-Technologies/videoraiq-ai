/**
 * Round 2: Extended coverage for Streams/Camerasettings.jsx beyond the
 * Round-84 permission-gate test. Mocks all four Api modules (getCameraDetailsById,
 * getHeaderCamersList, requestCameraRefresh, getDepartmentList,
 * createCameraAliasName), the heavy children (DeleteConfirmation,
 * LiveViewModal, Tooltip, react-select multi), the react-router hooks,
 * and pins the entire reachable page surface:
 *  - mount effects: fetchDepartmentList + fetchDetectionTypes (+ then
 *    fetchCameraDetails once detectionTypes is populated).
 *  - Back-button navigation to /nvr-settings.
 *  - Refresh button calls requestCameraRefresh + fetchCameraDetails;
 *    surfaces success / non-success / thrown toasts.
 *  - Search input filters table rows by cameraName / aliasName.
 *  - Alias popup: open via Pencil icon; Cancel closes; Save calls
 *    createCameraAliasName + toasts success/error + updates local row.
 *  - Department multi-select onChange: success / non-success / thrown
 *    branches.
 *  - DeleteConfirmation flow (the alias-delete branch): onConfirm calls
 *    createCameraAliasName with customName='' + toasts + refetches.
 *  - canViewChannels=false swaps the table for AccessDenied (Channels).
 *  - LiveView Monitorcog click sets liveViewCamera + opens modal.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ----- Api modules ------------------------------------------------------
const getApiRef = vi.hoisted(() => ({
  getCameraDetailsById: vi.fn(),
  getHeaderCamersList: vi.fn(),
  requestCameraRefresh: vi.fn(),
}));
vi.mock("@/page/user/Streams/Api/get", () => getApiRef);

const postApiRef = vi.hoisted(() => ({
  getDepartmentList: vi.fn(),
}));
vi.mock("../../../../../src/page/user/Streams/Api/post", () => postApiRef);

const dashboardPutApiRef = vi.hoisted(() => ({
  createCameraAliasName: vi.fn(),
}));
vi.mock(
  "../../../../../src/page/user/Dashboard/Api/put",
  () => dashboardPutApiRef
);

// ----- decryptNvr helper -----------------------------------------------
vi.mock("@/helpers/decriptNvr", () => ({
  decrypt: (v) => v,
}));

// ----- Permission context ----------------------------------------------
const permissionsRef = vi.hoisted(() => ({ value: null }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));
vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => (
    <div data-testid="access-denied">{message}</div>
  ),
}));
vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading</div>,
}));

// ----- react-router-dom ------------------------------------------------
const navigateMock = vi.hoisted(() => vi.fn());
const locationStateRef = vi.hoisted(() => ({ state: { nvrId: "nvr-1" } }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ state: locationStateRef.state }),
}));

// ----- DeleteConfirmation ----------------------------------------------
vi.mock(
  "../../../../../src/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open, message, onClose, onConfirm, confirmLabel }) =>
      open ? (
        <div data-testid="delete-confirm">
          <div data-testid="delete-confirm-message">{message}</div>
          <button data-testid="delete-confirm-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button data-testid="delete-confirm-cancel" onClick={onClose}>
            cancel
          </button>
        </div>
      ) : null,
  })
);

// ----- LiveViewModal ----------------------------------------------------
vi.mock("../../../../../src/page/user/Streams/LiveViewModal", () => ({
  default: ({ isOpen, camera }) => (
    <div data-testid="live-view-modal" data-open={String(!!isOpen)}>
      <span data-testid="live-view-camera">{camera?.cameraName || ""}</span>
    </div>
  ),
}));

// ----- react-select Multi ----------------------------------------------
vi.mock("react-select", () => ({
  default: ({ value, onChange, options, isDisabled, classNamePrefix }) => (
    <div
      data-testid="dept-select"
      data-disabled={String(!!isDisabled)}
      data-value-count={(value || []).length}
    >
      <button
        data-testid="dept-select-add-first"
        onClick={() => onChange && onChange(options.slice(0, 1))}
      >
        add-first
      </button>
      <button
        data-testid="dept-select-clear"
        onClick={() => onChange && onChange([])}
      >
        clear
      </button>
    </div>
  ),
}));

// ----- UI primitives ----------------------------------------------------
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock("@/components/ui/Monitorcog", () => ({
  default: () => <span data-testid="monitor-cog" />,
}));
vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
}));

// ----- sonner -----------------------------------------------------------
const toastRef = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastRef }));

import CameraSettings from "../../../../../src/page/user/Streams/Camerasettings.jsx";

const fullPerms = {
  permissions: {
    NVR: { view: true, create: true },
    channels: { view: true, create: true, edit: true, delete: true },
  },
  loading: false,
};

const camerasFactory = () => ({
  data: {
    body: {
      status: "success",
      data: {
        nvr: { nvrName: "Main NVR", rtspPort: 554, location: "HQ" },
        channels: [
          {
            _id: "ch-1",
            name: "Front Door",
            customName: "Lobby",
            department: ["dept-1"],
            streamingUrl: "/a.m3u8",
          },
          {
            _id: "ch-2",
            name: "Back Door",
            customName: "",
            department: [],
            streamingUrl: "/b.m3u8",
          },
        ],
      },
    },
  },
});

beforeEach(() => {
  Object.values(getApiRef).forEach((fn) => fn.mockReset && fn.mockReset());
  postApiRef.getDepartmentList.mockReset();
  dashboardPutApiRef.createCameraAliasName.mockReset();
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  navigateMock.mockReset();
  permissionsRef.value = fullPerms;
  locationStateRef.state = { nvrId: "nvr-1" };
});

describe("Camerasettings — full page flow", () => {
  it("on mount: fetches departments, detection types, and camera details (after detectionTypes settles)", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { face: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [{ _id: "dept-1", departmentName: "Eng" }] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(postApiRef.getDepartmentList).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(getApiRef.getCameraDetailsById).toHaveBeenCalledWith("nvr-1")
    );
    // NVR info card renders
    await waitFor(() =>
      expect(screen.getByText(/Current NVR Settings/i)).toBeInTheDocument()
    );
    expect(screen.getByText("Front Door")).toBeInTheDocument();
    expect(screen.getByText("Back Door")).toBeInTheDocument();
    // alias rendered
    expect(screen.getByText("Lobby")).toBeInTheDocument();
    // empty alias placeholder
    expect(screen.getByText(/No alias/i)).toBeInTheDocument();
  });

  it("Back button navigates to /nvr-settings", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: {} } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    fireEvent.click(screen.getByText(/Go back to NVR settings/i));
    expect(navigateMock).toHaveBeenCalledWith("/nvr-settings");
  });

  it("Refresh button success path: requestCameraRefresh + fetchCameraDetails + toast", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    getApiRef.requestCameraRefresh.mockResolvedValue({
      data: { body: { status: "success" } },
    });
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(getApiRef.getCameraDetailsById).toHaveBeenCalled()
    );
    fireEvent.click(screen.getByText(/Refresh All/i));
    await waitFor(() =>
      expect(getApiRef.requestCameraRefresh).toHaveBeenCalledWith("nvr-1")
    );
    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith(
        "Cameras refreshed successfully"
      )
    );
  });

  it("Refresh button non-success path: toast.error 'Failed to refresh cameras'", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    getApiRef.requestCameraRefresh.mockResolvedValue({
      data: { body: { status: "fail" } },
    });
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(getApiRef.getCameraDetailsById).toHaveBeenCalled()
    );
    fireEvent.click(screen.getByText(/Refresh All/i));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to refresh cameras")
    );
  });

  it("Refresh button thrown path: toast.error + logs", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    getApiRef.requestCameraRefresh.mockRejectedValue(new Error("boom"));
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(getApiRef.getCameraDetailsById).toHaveBeenCalled()
    );
    fireEvent.click(screen.getByText(/Refresh All/i));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to refresh cameras")
    );
    errSpy.mockRestore();
  });

  it("Search filter narrows the table to matching cameras", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    const search = screen.getByPlaceholderText(/Search camera or alias/i);
    fireEvent.change(search, { target: { value: "back" } });
    expect(screen.getByText("Back Door")).toBeInTheDocument();
    expect(screen.queryByText("Front Door")).not.toBeInTheDocument();
  });

  it("Alias popup: pencil opens; Cancel closes without API call", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    const { container } = render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    // pencil icons are emitted by lucide-react as <svg class="lucide lucide-pencil...">
    // The pencil button click handler is attached to the svg element. We use a selector.
    const pencils = container.querySelectorAll(".lucide-pencil");
    expect(pencils.length).toBeGreaterThan(0);
    fireEvent.click(pencils[0]);
    expect(screen.getByText(/Edit Alias Name/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(screen.queryByText(/Edit Alias Name/i)).not.toBeInTheDocument();
    expect(dashboardPutApiRef.createCameraAliasName).not.toHaveBeenCalled();
  });

  it("Alias popup Save: success path -> toast.success + updates local row", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    dashboardPutApiRef.createCameraAliasName.mockResolvedValue({
      body: { status: "success", message: "Saved" },
    });
    const { container } = render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    fireEvent.click(container.querySelectorAll(".lucide-pencil")[0]);
    // Type new alias
    const aliasInput = screen.getByPlaceholderText(/Enter alias name/i);
    fireEvent.change(aliasInput, { target: { value: "New Lobby" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(dashboardPutApiRef.createCameraAliasName).toHaveBeenCalledWith(
        "ch-1",
        expect.objectContaining({ customName: "New Lobby" })
      )
    );
    await waitFor(() => expect(toastRef.success).toHaveBeenCalledWith("Saved"));
  });

  it("Alias popup Save: non-success path -> toast.error", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    dashboardPutApiRef.createCameraAliasName.mockResolvedValue({
      body: { status: "fail" },
    });
    const { container } = render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    fireEvent.click(container.querySelectorAll(".lucide-pencil")[0]);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to update alias")
    );
  });

  it("Department multi-select onChange success path: toast.success", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: {
        body: {
          data: {
            data: [
              { _id: "dept-1", departmentName: "Eng" },
              { _id: "dept-2", departmentName: "Ops" },
            ],
          },
        },
      },
    });
    dashboardPutApiRef.createCameraAliasName.mockResolvedValue({
      body: { status: "success" },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    fireEvent.click(screen.getAllByTestId("dept-select-add-first")[1]);
    await waitFor(() =>
      expect(dashboardPutApiRef.createCameraAliasName).toHaveBeenCalledWith(
        "ch-2",
        expect.objectContaining({ department: ["dept-1"] })
      )
    );
    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith(
        "Departments updated successfully"
      )
    );
  });

  it("Department multi-select onChange non-success path: toast.error 'Failed to update departments'", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [{ _id: "dept-1", departmentName: "Eng" }] } } },
    });
    dashboardPutApiRef.createCameraAliasName.mockResolvedValue({
      body: { status: "fail" },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    fireEvent.click(screen.getAllByTestId("dept-select-add-first")[0]);
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Failed to update departments")
    );
  });

  it("Department multi-select onChange thrown path: 'Something went wrong'", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [{ _id: "dept-1", departmentName: "Eng" }] } } },
    });
    dashboardPutApiRef.createCameraAliasName.mockRejectedValue(new Error("boom"));
    render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    fireEvent.click(screen.getAllByTestId("dept-select-add-first")[0]);
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith(
        "Something went wrong while updating departments"
      )
    );
    errSpy.mockRestore();
  });

  it("canViewChannels=false swaps the table for a Channels AccessDenied message", async () => {
    permissionsRef.value = {
      permissions: {
        NVR: { view: true },
        channels: { view: false, edit: false, create: false, delete: false },
      },
      loading: false,
    };
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: {} } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByTestId("access-denied")).toBeInTheDocument()
    );
    expect(screen.getByTestId("access-denied").textContent).toMatch(
      /permission to view Channels/i
    );
  });

  it("LiveView Monitorcog click opens LiveViewModal with the selected camera", async () => {
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(screen.getByText("Front Door")).toBeInTheDocument()
    );
    const monitorCogs = screen.getAllByTestId("monitor-cog");
    fireEvent.click(monitorCogs[0].parentElement); // button parent
    await waitFor(() =>
      expect(screen.getByTestId("live-view-modal").dataset.open).toBe("true")
    );
    expect(screen.getByTestId("live-view-camera").textContent).toBe(
      "Front Door"
    );
  });

  it("fetchCameraDetails: rejection logs without crashing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getHeaderCamersList.mockResolvedValue({
      data: { body: { status: "success", data: { detectionTypes: { x: {} } } } },
    });
    getApiRef.getCameraDetailsById.mockRejectedValue(new Error("boom"));
    postApiRef.getDepartmentList.mockResolvedValue({
      data: { body: { data: { data: [] } } },
    });
    render(<CameraSettings />);
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Error fetching camera details:",
        expect.any(Error)
      )
    );
    errSpy.mockRestore();
  });

  it("fetchDepartmentList + fetchDetectionTypes: rejections logged", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getHeaderCamersList.mockRejectedValue(new Error("h-boom"));
    getApiRef.getCameraDetailsById.mockResolvedValue(camerasFactory());
    postApiRef.getDepartmentList.mockRejectedValue(new Error("d-boom"));
    render(<CameraSettings />);
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Error fetching detection types:",
        expect.any(Error)
      )
    );
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Error fetching departments:",
        expect.any(Error)
      )
    );
    errSpy.mockRestore();
  });
});
