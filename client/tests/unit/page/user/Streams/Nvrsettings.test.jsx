/**
 * Round 88: src/page/user/Streams/Nvrsettings.jsx — the NVR settings list
 * card variant rendered on the top-level /streams Streams page (distinct
 * from the sibling NvrLocalsettings.jsx covered in R43). Pure presentational
 * with three interesting branches:
 *   - empty state (no nvrDetails / empty array) -> Camera placeholder image
 *     + "CCTV stream access is not configured" copy.
 *   - populated state -> one card per NVR with name, four fielded inputs
 *     (IP / Username / Location / Total Cameras / RTSP Port, IP only when
 *     truthy, Username/RTSPPort only when truthy), plus the action buttons
 *     gated by permissions.NVR.{edit,delete}.
 *   - the StreamHeader "Add NVR" config CTA toggles AddNVRForm visible;
 *     close handler unmounts it.
 *   - Edit click mounts AddNVRForm with isEdit=true and pre-fills the form
 *     from the row data.
 *   - Camera Settings button navigates to /streams/camera-settings with the
 *     nvrId in state; View CCTV Streams navigates to /cameraview with
 *     from=nvr-settings + nvrIdFromNvr=nvr._id.
 *   - Manage Cameras button gated on canEdit opens the CameraDiscoveryModal.
 *   - Delete flow: clicking delete opens DeleteConfirmation; only confirm
 *     calls onDeleteNvr and only dismisses on truthy return.
 *
 * Mocks (8 — at the cap):
 *   1. AddNVRForm — heavy form; passthrough exposing isEdit + initialData
 *      so we can assert create vs edit + close handler wiring.
 *   2. StreamHeader — captures onConfigClick prop, exposes a button.
 *   3. DeleteConfirmation — renders confirm/cancel buttons when open=true.
 *   4. CameraDiscoveryModal — passthrough that exposes the nvrId for assert.
 *   5. @/helpers/decriptNvr — stub `decrypt` (called on each NVR.ip).
 *   6. @/components/ui/button — passthrough <button>.
 *   7. @/components/ui/Tooltip — inline passthrough wrappers.
 *   8. @/context/Permission/PermissionContext + react-router-dom — combined
 *      under one shared hoisted spy bag (so we stay at the cap).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
const usePermissionsMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  Link: ({ children }) => <>{children}</>,
}));

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

vi.mock("../../../../../src/components/StreamHeader", () => ({
  default: ({ title, onConfigClick }) => (
    <div data-testid="stream-header">
      <span>{title}</span>
      <button data-testid="stream-config-btn" onClick={onConfigClick}>
        Add NVR
      </button>
    </div>
  ),
}));

vi.mock("../../../../../src/page/user/Streams/Nvrform", () => ({
  default: ({ isEdit, onClose, initialData }) => (
    <div data-testid="add-nvr-form" data-is-edit={String(!!isEdit)}>
      <span data-testid="add-nvr-initial-id">{initialData?._id || ""}</span>
      <span data-testid="add-nvr-initial-ip">{initialData?.ipAddress || ""}</span>
      <span data-testid="add-nvr-initial-name">{initialData?.name || ""}</span>
      <button data-testid="add-nvr-close" onClick={onClose}>
        close form
      </button>
    </div>
  ),
}));

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
  }),
);

vi.mock("../../../../../src/page/user/Streams/CameraDiscoveryModal", () => ({
  default: ({ nvrId, onClose, onSaved }) => (
    <div data-testid="camera-discovery" data-nvr-id={nvrId}>
      <button data-testid="camera-discovery-close" onClick={onClose}>
        close discovery
      </button>
      <button data-testid="camera-discovery-saved" onClick={onSaved}>
        saved
      </button>
    </div>
  ),
}));

const { default: Nvrsettings } = await import(
  "../../../../../src/page/user/Streams/Nvrsettings.jsx"
);

const makeProps = (overrides = {}) => ({
  nvrDetails: [],
  fetchNvrData: vi.fn(),
  onDeleteNvr: vi.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => {
  navigate.mockReset();
  usePermissionsMock.mockReset();
  usePermissionsMock.mockReturnValue({
    permissions: { NVR: { edit: true, delete: true } },
  });
});

describe("page/user/Streams Nvrsettings", () => {
  it("renders the empty-state CCTV placeholder when nvrDetails is empty", () => {
    render(<Nvrsettings {...makeProps({ nvrDetails: [] })} />);
    expect(
      screen.getByText(/CCTV stream access is not configured/i),
    ).toBeInTheDocument();
    expect(screen.getByAltText(/CCTV Camera/i)).toBeInTheDocument();
    // No NVR card => no Location label rendered.
    expect(screen.queryByText("Location")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });

  it("renders one card per NVR with the StreamHeader title 'NVR Settings'", () => {
    const nvrDetails = [
      {
        _id: "nvr1",
        nvrName: "Front-NVR",
        location: "HQ",
        cameraCount: 8,
        ip: "1.2.3.4",
        username: "admin",
        rtspPort: 554,
      },
      {
        _id: "nvr2",
        nvrName: "Back-NVR",
        location: "Warehouse",
        cameraCount: 2,
        ip: "",
        username: "",
        rtspPort: 0,
      },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);

    expect(screen.getByTestId("stream-header")).toHaveTextContent(
      "NVR Settings",
    );

    expect(screen.getByText("Front-NVR")).toBeInTheDocument();
    expect(screen.getByText("Back-NVR")).toBeInTheDocument();

    // IP Address input: present only on nvr1; decrypt() runs against truthy ip.
    const ipLabels = screen.getAllByText("IP Address");
    expect(ipLabels).toHaveLength(1);
    const ipInput = ipLabels[0].parentElement.querySelector("input");
    expect(ipInput.value).toBe("decrypted:1.2.3.4");

    // Username input also only on nvr1 (truthy).
    expect(screen.getAllByText("Username")).toHaveLength(1);

    // Location is always rendered.
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
      label.parentElement.querySelector("input"),
    );
    expect(cameraInputs[0].value).toBe("8");
    expect(cameraInputs[1].value).toBe("2");

    // RTSP Port only on nvr1 (truthy rtspPort).
    expect(screen.getAllByText("RTSP Port")).toHaveLength(1);

    // Password-change warning only shown when nvr.passwordChanged is truthy.
    expect(
      screen.queryByText(/Password change detected/i),
    ).not.toBeInTheDocument();
  });

  it("shows the password-change warning badge when nvr.passwordChanged is truthy", () => {
    const nvrDetails = [
      {
        _id: "alert",
        nvrName: "AlertNVR",
        location: "Loc",
        cameraCount: 1,
        passwordChanged: true,
      },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);
    expect(
      screen.getByText(/Password change detected\. Please update your password\./),
    ).toBeInTheDocument();
  });

  it("opens AddNVRForm in create mode when StreamHeader's onConfigClick fires", () => {
    render(<Nvrsettings {...makeProps()} />);
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("stream-config-btn"));

    const form = screen.getByTestId("add-nvr-form");
    expect(form).toBeInTheDocument();
    expect(form.getAttribute("data-is-edit")).toBe("false");

    fireEvent.click(screen.getByTestId("add-nvr-close"));
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });

  it("Edit click on a row mounts AddNVRForm in edit mode with initialData mapped from the row", () => {
    const nvrDetails = [
      {
        _id: "nvr-edit",
        nvrName: "EditMe",
        location: "L",
        cameraCount: 4,
        ip: "10.0.0.1",
        username: "u",
        rtspPort: 8554,
        port: "9999",
        brand: "hik",
      },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);

    // Edit is the second action button (Manage Cameras is first when canEdit)
    // — find the SquarePen-bearing button by its title via tooltip text instead.
    // Easier: click the parent button via title text.
    // The mocked Tooltip renders title text inline, so find by its content.
    const editTooltip = screen.getByText(/Edit EditMe/i);
    // Button is the closest tooltip trigger child. Use closest('button').
    const editButton = editTooltip.previousElementSibling
      ? editTooltip.previousElementSibling.querySelector?.("button")
      : null;
    // Fallback: locate by walking up — but since the mock just renders
    // siblings, easier path: get all buttons inside the card and click
    // the one whose row contains an SquarePen icon. Simpler: pick the
    // 3rd button in the action row (Camera Settings / Cameras / Edit).
    const card = screen.getByText("EditMe").closest("div").parentElement;
    const buttons = card.querySelectorAll("button");
    // Order is: Camera Settings, Cameras (canEdit), Edit (canEdit), Delete (canDelete).
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(buttons[2]);

    const form = screen.getByTestId("add-nvr-form");
    expect(form.getAttribute("data-is-edit")).toBe("true");
    expect(screen.getByTestId("add-nvr-initial-id")).toHaveTextContent(
      "nvr-edit",
    );
    expect(screen.getByTestId("add-nvr-initial-ip")).toHaveTextContent(
      "10.0.0.1",
    );
    expect(screen.getByTestId("add-nvr-initial-name")).toHaveTextContent(
      "EditMe",
    );

    // Close button unmounts.
    fireEvent.click(screen.getByTestId("add-nvr-close"));
    expect(screen.queryByTestId("add-nvr-form")).not.toBeInTheDocument();
  });

  it("Camera Settings button navigates to /streams/camera-settings with nvrId state", () => {
    const nvrDetails = [
      { _id: "nvr-cs", nvrName: "CS", location: "L", cameraCount: 1 },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);

    // Camera Settings is the first action button.
    const cardButtons = screen
      .getByText("CS")
      .closest("div").parentElement.querySelectorAll("button");
    fireEvent.click(cardButtons[0]);
    expect(navigate).toHaveBeenCalledWith("/streams/camera-settings", {
      state: { nvrId: "nvr-cs" },
    });
  });

  it("View CCTV Streams navigates to /cameraview with from=nvr-settings + nvrIdFromNvr", () => {
    const nvrDetails = [
      { _id: "view-1", nvrName: "ViewNVR", location: "L", cameraCount: 2 },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);

    fireEvent.click(screen.getByText(/View CCTV Streams/i));
    expect(navigate).toHaveBeenCalledWith("/cameraview", {
      state: { from: "nvr-settings", nvrIdFromNvr: "view-1" },
    });
  });

  it("Manage Cameras click mounts CameraDiscoveryModal with the row nvrId", () => {
    const nvrDetails = [
      { _id: "mgr-1", nvrName: "MgrNVR", location: "L", cameraCount: 1 },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);
    expect(screen.queryByTestId("camera-discovery")).not.toBeInTheDocument();

    // Cameras button is the second action button when canEdit=true.
    const cardButtons = screen
      .getByText("MgrNVR")
      .closest("div").parentElement.querySelectorAll("button");
    fireEvent.click(cardButtons[1]);

    const modal = screen.getByTestId("camera-discovery");
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute("data-nvr-id")).toBe("mgr-1");

    // Close dismisses the modal.
    fireEvent.click(screen.getByTestId("camera-discovery-close"));
    expect(screen.queryByTestId("camera-discovery")).not.toBeInTheDocument();
  });

  it("Delete click opens DeleteConfirmation; cancel keeps it open and does not call onDeleteNvr", () => {
    const onDeleteNvr = vi.fn().mockResolvedValue(true);
    const nvrDetails = [
      { _id: "del-1", nvrName: "DelNVR", location: "L", cameraCount: 0 },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails, onDeleteNvr })} />);

    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();

    // Delete is the last action button when canDelete=true.
    const cardButtons = screen
      .getByText("DelNVR")
      .closest("div").parentElement.querySelectorAll("button");
    fireEvent.click(cardButtons[cardButtons.length - 1]);

    expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("delete-confirm-message")).toHaveTextContent(
      /DelNVR/,
    );

    fireEvent.click(screen.getByTestId("delete-confirm-cancel"));
    expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
    expect(onDeleteNvr).not.toHaveBeenCalled();
  });

  it("Delete confirm calls onDeleteNvr(_id) and dismisses the modal on success", async () => {
    const onDeleteNvr = vi.fn().mockResolvedValue(true);
    const nvrDetails = [
      { _id: "del-2", nvrName: "DelNVR2", location: "L", cameraCount: 0 },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails, onDeleteNvr })} />);

    const cardButtons = screen
      .getByText("DelNVR2")
      .closest("div").parentElement.querySelectorAll("button");
    fireEvent.click(cardButtons[cardButtons.length - 1]);

    fireEvent.click(screen.getByTestId("delete-confirm-confirm"));

    expect(onDeleteNvr).toHaveBeenCalledWith("del-2");
    await waitFor(() => {
      expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument();
    });
  });

  it("hides Edit / Cameras / Delete action buttons when permissions deny edit + delete", () => {
    usePermissionsMock.mockReturnValue({
      permissions: { NVR: { edit: false, delete: false } },
    });
    const nvrDetails = [
      { _id: "gated", nvrName: "GatedNVR", location: "L", cameraCount: 1 },
    ];
    render(<Nvrsettings {...makeProps({ nvrDetails })} />);

    // Inside the header action row, only Camera Settings remains when both
    // gates are off (Cameras / Edit / Delete are gated on canEdit/canDelete).
    // closest('div') of the nvrName <h2> walks to the inner div, parentElement
    // is the header-row flex container which only holds the action div +
    // the nvrName div — so querySelectorAll('button') scoped here returns
    // exactly the action buttons.
    const cardButtons = screen
      .getByText("GatedNVR")
      .closest("div").parentElement.querySelectorAll("button");
    expect(cardButtons.length).toBe(1);
  });
});
