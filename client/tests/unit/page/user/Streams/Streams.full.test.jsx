/**
 * Round 2: Extended coverage for Streams/Streams.jsx beyond the existing
 * permission-gate test. Mocks the children + Api modules and pins:
 *  - Initial mount: skeleton (isLoading=true) -> after fetch resolves
 *    either the empty-state CTA or the Nvrsettings/NvrLocalsettings child
 *    depending on the result list length and VITE_LOCAL_SETUP.
 *  - StreamHeader CCTV Configurations button mounts AddNVRForm; onSubmit
 *    flips to Nvrsettings; onClose dismisses.
 *  - handleNvrDelete success / non-success / thrown branches.
 *  - canCreate=false hides the CCTV-config button (passed as
 *    showConfigButton prop).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ----- Api mocks --------------------------------------------------------
const getApiRef = vi.hoisted(() => ({
  getAllNvrDetails: vi.fn(),
}));
vi.mock("../../../../../src/page/user/Streams/Api/get", () => getApiRef);

const deleteApiRef = vi.hoisted(() => ({
  deleteNVR: vi.fn(),
}));
vi.mock(
  "../../../../../src/page/user/Streams/Api/delete",
  () => deleteApiRef
);

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

// ----- StreamHeader -----------------------------------------------------
vi.mock("@/components/StreamHeader", () => ({
  default: ({ title, onConfigClick, buttonText, showConfigButton }) => (
    <div data-testid="stream-header" data-title={title}>
      {showConfigButton && (
        <button data-testid="stream-header-cta" onClick={onConfigClick}>
          {buttonText}
        </button>
      )}
    </div>
  ),
}));

// ----- AddNVRForm -------------------------------------------------------
vi.mock("../../../../../src/page/user/Streams/Nvrform", () => ({
  default: ({ onClose, onSubmit, fetchNvrData }) => (
    <div data-testid="add-nvr-form">
      <button data-testid="add-nvr-close" onClick={onClose}>
        close
      </button>
      <button data-testid="add-nvr-submit" onClick={onSubmit}>
        submit
      </button>
      <button data-testid="add-nvr-refetch" onClick={fetchNvrData}>
        refetch
      </button>
    </div>
  ),
}));

// ----- Nvrsettings ------------------------------------------------------
vi.mock("../../../../../src/page/user/Streams/Nvrsettings", () => ({
  default: ({ onBack, nvrDetails, fetchNvrData, onDeleteNvr }) => (
    <div data-testid="nvr-settings" data-count={nvrDetails?.length || 0}>
      <button data-testid="nvr-settings-back" onClick={onBack}>
        back
      </button>
      <button data-testid="nvr-settings-fetch" onClick={fetchNvrData}>
        fetch
      </button>
      <button
        data-testid="nvr-settings-delete"
        onClick={() => onDeleteNvr && onDeleteNvr(nvrDetails?.[0]?._id)}
      >
        delete-first
      </button>
    </div>
  ),
}));

// ----- NvrLocalsettings -------------------------------------------------
vi.mock("../../../../../src/page/user/Streams/NvrLocalsettings", () => ({
  default: ({ onBack, nvrDetails, fetchNvrData, onDeleteNvr }) => (
    <div data-testid="nvr-local-settings" data-count={nvrDetails?.length || 0}>
      <button data-testid="nvr-local-back" onClick={onBack}>
        back
      </button>
      <button
        data-testid="nvr-local-delete"
        onClick={() => onDeleteNvr && onDeleteNvr(nvrDetails?.[0]?._id)}
      >
        delete-first
      </button>
    </div>
  ),
}));

// ----- Skeleton ---------------------------------------------------------
vi.mock("react-loading-skeleton", () => ({
  default: () => <div data-testid="skeleton" />,
}));

// ----- sonner -----------------------------------------------------------
const toastRef = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastRef }));

import Streams from "../../../../../src/page/user/Streams/Streams.jsx";

const viewPerms = {
  permissions: { NVR: { view: true, create: true } },
  loading: false,
};

beforeEach(() => {
  getApiRef.getAllNvrDetails.mockReset();
  deleteApiRef.deleteNVR.mockReset();
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  permissionsRef.value = viewPerms;
});

describe("Streams — full page flow", () => {
  it("on mount: skeleton flashes then empty list -> renders empty-state + StreamHeader", async () => {
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [] } } },
    });
    render(<Streams />);
    // initial skeleton (multiple skeleton elements rendered)
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByTestId("stream-header")).toBeInTheDocument()
    );
    // Empty-list -> shows empty state, not the NvrSettings child
    expect(screen.queryByTestId("nvr-settings")).not.toBeInTheDocument();
    expect(screen.getByText(/CCTV stream access is not configured/i)).toBeInTheDocument();
  });

  it("on mount with non-empty nvrs: routes to Nvrsettings child", async () => {
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [{ _id: "n1" }, { _id: "n2" }] } } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("nvr-settings")).toBeInTheDocument()
    );
    expect(screen.getByTestId("nvr-settings").dataset.count).toBe("2");
  });

  it("StreamHeader CCTV Configurations CTA opens AddNVRForm; close dismisses", async () => {
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [] } } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("stream-header")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("stream-header-cta"));
    expect(screen.getByTestId("add-nvr-form")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-nvr-close"));
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });

  it("AddNVRForm onSubmit flips into Nvrsettings view", async () => {
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [] } } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("stream-header")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("stream-header-cta"));
    fireEvent.click(screen.getByTestId("add-nvr-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("nvr-settings")).toBeInTheDocument()
    );
  });

  it("Nvrsettings back button returns to empty-state view", async () => {
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [{ _id: "n1" }] } } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("nvr-settings")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("nvr-settings-back"));
    await waitFor(() =>
      expect(screen.queryByTestId("nvr-settings")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("stream-header")).toBeInTheDocument();
  });

  it("handleNvrDelete: success path filters list, toasts, and refetches", async () => {
    getApiRef.getAllNvrDetails
      .mockResolvedValueOnce({
        data: { body: { data: { nvrs: [{ _id: "n1" }, { _id: "n2" }] } } },
      })
      .mockResolvedValueOnce({
        data: { body: { data: { nvrs: [{ _id: "n2" }] } } },
      });
    deleteApiRef.deleteNVR.mockResolvedValue({
      data: { body: { status: "success", message: "Removed" } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("nvr-settings")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("nvr-settings-delete"));
    await waitFor(() =>
      expect(deleteApiRef.deleteNVR).toHaveBeenCalledWith("n1")
    );
    await waitFor(() => expect(toastRef.success).toHaveBeenCalledWith("Removed"));
    await waitFor(() =>
      expect(getApiRef.getAllNvrDetails).toHaveBeenCalledTimes(2)
    );
  });

  it("handleNvrDelete: non-success response toasts the server message", async () => {
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [{ _id: "n1" }] } } },
    });
    deleteApiRef.deleteNVR.mockResolvedValue({
      data: { body: { status: "fail", message: "Locked" } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("nvr-settings")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("nvr-settings-delete"));
    await waitFor(() => expect(toastRef.error).toHaveBeenCalledWith("Locked"));
  });

  it("handleNvrDelete: thrown logs and returns false (no toast)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [{ _id: "n1" }] } } },
    });
    deleteApiRef.deleteNVR.mockRejectedValue(new Error("boom"));
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("nvr-settings")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("nvr-settings-delete"));
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Failed to delete NVR:",
        expect.any(Error)
      )
    );
    errSpy.mockRestore();
  });

  it("fetchNvrData rejection logs and clears isLoading", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getApiRef.getAllNvrDetails.mockRejectedValue(new Error("net"));
    render(<Streams />);
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Error fetching NVRs:",
        expect.any(Error)
      )
    );
    // After rejection, skeleton clears -> render lands on empty-state + StreamHeader
    await waitFor(() =>
      expect(screen.getByTestId("stream-header")).toBeInTheDocument()
    );
    errSpy.mockRestore();
  });

  it("VITE_LOCAL_SETUP=true: routes to NvrLocalsettings instead of Nvrsettings", async () => {
    const original = import.meta.env.VITE_LOCAL_SETUP;
    import.meta.env.VITE_LOCAL_SETUP = "true";
    try {
      getApiRef.getAllNvrDetails.mockResolvedValue({
        data: { body: { data: { nvrs: [{ _id: "n1" }] } } },
      });
      render(<Streams />);
      await waitFor(() =>
        expect(screen.getByTestId("nvr-local-settings")).toBeInTheDocument()
      );
      expect(screen.queryByTestId("nvr-settings")).not.toBeInTheDocument();
    } finally {
      import.meta.env.VITE_LOCAL_SETUP = original;
    }
  });

  it("canCreate=false hides the StreamHeader CCTV CTA", async () => {
    permissionsRef.value = {
      permissions: { NVR: { view: true, create: false } },
      loading: false,
    };
    getApiRef.getAllNvrDetails.mockResolvedValue({
      data: { body: { data: { nvrs: [] } } },
    });
    render(<Streams />);
    await waitFor(() =>
      expect(screen.getByTestId("stream-header")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("stream-header-cta")).not.toBeInTheDocument();
  });
});
