/**
 * src/page/user/Streams/NvrLocalsettings.jsx — presentational NVR list card
 * with three interesting branches:
 *   - empty state (no nvrDetails / empty array) renders the "no CCTV
 *     configured" message + Camera placeholder image.
 *   - populated state renders one card per NVR with name, location,
 *     cameraCount, plus the two action icons (gear -> handleCameraSettings,
 *     eye -> /cameraview navigate).
 *   - the "Add NVR" header CTA toggles AddNVRForm visible (showAddForm).
 *   - delete flow: opening confirmation modal does NOT call onDeleteNvr; the
 *     confirm callback calls it and dismisses on success.
 *
 * Mocks (8):
 *   1. AddNVRForm — heavy form, replace with a passthrough that shows the
 *      `isEdit` flag so we can assert which mode opened.
 *   2. StreamHeader — captures the onConfigClick prop and exposes a button
 *      so we can click it to drive showAddForm.
 *   3. DeleteConfirmation — render its confirmation buttons when open=true
 *      so we can drive the confirm path.
 *   4. @/components/ui/button — passthrough <button>.
 *   5. @/components/ui/Tooltip — inline passthrough wrappers (the Radix
 *      portal otherwise pulls Provider context).
 *   6. @/helpers/decriptNvr — stub `decrypt` (the file imports it even
 *      though current usage is commented out).
 *   7. @/context/Permission/PermissionContext — usePermissions hook stub.
 *   8. react-router-dom — useNavigate -> shared spy so we can assert the
 *      cameraview navigate call.
 *
 * Asset imports (../../../assets/Camera.svg) resolve to the real string at
 * test time; vitest's default asset handling stubs them as text, which is
 * fine — we only need to assert the empty-state <img> exists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  Link: ({ children }) => <>{children}</>,
}));

const usePermissionsMock = vi.hoisted(() => vi.fn());
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: usePermissionsMock,
}));

vi.mock("@/helpers/decriptNvr", () => ({
  decrypt: (v) => `decrypted:${v}`,
  encrypt: (v) => `encrypted:${v}`,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <>{children}</>,
  TooltipProvider: ({ children }) => <>{children}</>,
}));

vi.mock(
  "../../../../../src/components/StreamHeader",
  () => ({
    default: ({ title, onConfigClick }) => (
      <div data-testid="stream-header">
        <span>{title}</span>
        <button data-testid="stream-config-btn" onClick={onConfigClick}>
          Add NVR
        </button>
      </div>
    ),
  })
);

vi.mock(
  "../../../../../src/page/user/Streams/Nvrform",
  () => ({
    default: ({ isEdit, onClose, initialData }) => (
      <div data-testid="add-nvr-form" data-is-edit={String(!!isEdit)}>
        <span data-testid="add-nvr-initial-id">
          {initialData?._id || ""}
        </span>
        <button data-testid="add-nvr-close" onClick={onClose}>
          close form
        </button>
      </div>
    ),
  })
);

vi.mock(
  "../../../../../src/page/user/Detection/components/DeleteConfirmation",
  () => ({
    default: ({ open, onClose, onConfirm, message, confirmLabel }) =>
      open ? (
        <div data-testid="delete-confirm">
          <div data-testid="delete-confirm-message">{message}</div>
          <button data-testid="delete-confirm-cancel" onClick={onClose}>
            cancel
          </button>
          <button data-testid="delete-confirm-confirm" onClick={onConfirm}>
            {confirmLabel || "Delete"}
          </button>
        </div>
      ) : null,
  })
);

const { default: NvrLocalsettings } = await import(
  "../../../../../src/page/user/Streams/NvrLocalsettings.jsx"
);

const makeProps = (overrides = {}) => ({
  nvrDetails: [],
  fetchNvrData: vi.fn(),
  onDeleteNvr: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  navigate.mockReset();
  usePermissionsMock.mockReset();
  usePermissionsMock.mockReturnValue({
    permissions: { NVR: { edit: true, delete: true } },
  });
});

describe("page/user/Streams NvrLocalsettings", () => {
  it("renders the empty-state CCTV placeholder when nvrDetails is empty", () => {
    render(<NvrLocalsettings {...makeProps({ nvrDetails: [] })} />);
    expect(
      screen.getByText(/CCTV stream access is not configured/i)
    ).toBeInTheDocument();
    // No NVR card => no Location label rendered.
    expect(screen.queryByText("Location")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });

  it("renders one NVR card per item with name, location, and camera count", () => {
    const nvrDetails = [
      {
        _id: "nvr1",
        nvrName: "Front-NVR",
        location: "HQ",
        cameraCount: 8,
        passwordChanged: false,
      },
      {
        _id: "nvr2",
        nvrName: "Back-NVR",
        location: "Warehouse",
        cameraCount: 2,
        passwordChanged: false,
      },
    ];
    render(<NvrLocalsettings {...makeProps({ nvrDetails })} />);

    expect(screen.getByText("Front-NVR")).toBeInTheDocument();
    expect(screen.getByText("Back-NVR")).toBeInTheDocument();

    // Both Location inputs (disabled) carry the location string as their value.
    const locationInputs = screen
      .getAllByText("Location")
      .map((label) => label.parentElement.querySelector("input"));
    expect(locationInputs).toHaveLength(2);
    expect(locationInputs[0].value).toBe("HQ");
    expect(locationInputs[1].value).toBe("Warehouse");

    // Total Cameras shows the cameraCount field.
    const totalLabels = screen.getAllByText("Total Cameras");
    expect(totalLabels).toHaveLength(2);
    const cameraInputs = totalLabels.map((label) =>
      label.parentElement.querySelector("input")
    );
    expect(cameraInputs[0].value).toBe("8");
    expect(cameraInputs[1].value).toBe("2");
  });

  it("opens AddNVRForm in create mode when StreamHeader's onConfigClick fires", () => {
    render(<NvrLocalsettings {...makeProps()} />);
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stream-config-btn"));

    const form = screen.getByTestId("add-nvr-form");
    expect(form).toBeInTheDocument();
    expect(form.getAttribute("data-is-edit")).toBe("false");

    // close hides it again
    fireEvent.click(screen.getByTestId("add-nvr-close"));
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });

  it("the eye icon navigates to /cameraview with from-nvr-settings state", () => {
    const nvrDetails = [
      {
        _id: "nvr-eye",
        nvrName: "EyeNVR",
        location: "Loc-E",
        cameraCount: 3,
      },
    ];
    const { container } = render(
      <NvrLocalsettings {...makeProps({ nvrDetails })} />
    );

    // Action buttons live in the same row as the cameraCount input. The
    // component renders exactly two action buttons per card (gear, eye).
    const actionButtons = container.querySelectorAll(
      "button.cursor-pointer.p-1\\.5"
    );
    expect(actionButtons.length).toBe(2);

    // Second action button is the eye -> /cameraview navigate.
    fireEvent.click(actionButtons[1]);
    expect(navigate).toHaveBeenCalledWith("/cameraview", {
      state: { from: "nvr-settings", nvrIdFromNvr: "nvr-eye" },
    });
  });

  it("the gear icon navigates to /streams/camera-settings with the nvrId in state", () => {
    const nvrDetails = [
      {
        _id: "nvr-gear",
        nvrName: "GearNVR",
        location: "Loc-G",
        cameraCount: 1,
      },
    ];
    const { container } = render(
      <NvrLocalsettings {...makeProps({ nvrDetails })} />
    );

    const actionButtons = container.querySelectorAll(
      "button.cursor-pointer.p-1\\.5"
    );
    // First action button is the gear -> camera settings navigate.
    fireEvent.click(actionButtons[0]);
    expect(navigate).toHaveBeenCalledWith("/streams/camera-settings", {
      state: { nvrId: "nvr-gear" },
    });
  });

  it("DeleteConfirmation is hidden by default and renders no confirm UI", () => {
    const nvrDetails = [{ _id: "x", nvrName: "X", location: "L", cameraCount: 0 }];
    render(<NvrLocalsettings {...makeProps({ nvrDetails })} />);
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
  });

  it("clicking the AddNVRForm close handler resets showAddForm so the form unmounts", () => {
    render(<NvrLocalsettings {...makeProps()} />);
    fireEvent.click(screen.getByTestId("stream-config-btn"));
    expect(screen.getByTestId("add-nvr-form")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-nvr-close"));
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });
});
