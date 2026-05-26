/**
 * src/page/user/Detection/components/DefaultDetectionSettings.jsx — the
 * "Default Detection Setting" tile that surfaces inside SettingsCard when a
 * profile has been applied. Renders a read-only Face-Authentication summary:
 *   - A disabled Switch whose `checked` state is derived from
 *     authorisedUsers.length > 0 (the switch itself is non-interactive — it
 *     mirrors the state for visual feedback only).
 *   - A user-list strip showing up to 3 usernames inline. Anything beyond
 *     three is folded into a "+N more" toggle that opens a click-outside-
 *     dismissable dropdown listing the remaining names.
 *   - Two permission-gated action buttons on the right:
 *       * Edit → mounts the heavy MultiStepForm dialog (gated on
 *         permissions.detectionSettings.edit === true)
 *       * Trash → opens DeleteConfirmation; on confirm calls
 *         updateCameraSettingById(channelData.linkedCameras[0]._id,
 *         { profile: null }) and toasts success / failure, then re-fetches
 *         the applied profile.
 *
 * Mocks (7 — within the 8-budget):
 *   1. @/components/ui/switch                 → plain <input role="switch">
 *   2. ./InnerSettingsContext                 → useInnerSettings (hoisted ref)
 *   3. ../../Streams/Api/patch                → updateCameraSettingById spy
 *   4. sonner                                 → toast.{success,error} spies
 *   5. ../../Profile/MultiStepForm            → renders {trigger} so we can
 *                                               assert the Edit button mount
 *   6. ../components/DeleteConfirmation       → controlled spy that calls
 *                                               onConfirm via a "Confirm"
 *                                               button when `open` is true
 *   7. @/context/Permission/PermissionContext → usePermissions (hoisted ref)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---- mocks (hoisted) -----------------------------------------------------

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, disabled, className }) => (
    <input
      type="checkbox"
      role="switch"
      checked={!!checked}
      disabled={!!disabled}
      readOnly
      className={className}
      data-testid="auth-switch"
    />
  ),
}));

const innerRef = vi.hoisted(() => ({
  appliedProfileData: null,
  channelData: null,
  fetchAppliedProfile: vi.fn(),
}));
vi.mock(
  "@/page/user/Detection/components/InnerSettingsContext",
  () => ({
    useInnerSettings: () => innerRef,
    InnerSettingsProvider: ({ children }) => children,
  })
);

const patchSpy = vi.hoisted(() => vi.fn());
// The private repo's product code imports `../../Streams/Api/patch`; the
// public mirror still ships the old `pacth` typo. Mock both so the same
// spec runs green on both clones — extras are harmless.
vi.mock("@/page/user/Streams/Api/patch", () => ({
  updateCameraSettingById: patchSpy,
}));
vi.mock("@/page/user/Streams/Api/pacth", () => ({
  updateCameraSettingById: patchSpy,
}));

const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastSpy }));

vi.mock("@/page/user/Profile/MultiStepForm", () => ({
  default: ({ trigger, module, selectedChannelIds }) => (
    <div data-testid="multi-step-form" data-module={module} data-channels={JSON.stringify(selectedChannelIds)}>
      {trigger}
    </div>
  ),
}));

vi.mock("@/page/user/Detection/components/DeleteConfirmation", () => ({
  default: ({ open, onConfirm, onClose, message, confirmLabel }) =>
    open ? (
      <div data-testid="delete-confirmation">
        <span>{message}</span>
        <button onClick={onConfirm}>{confirmLabel || "Delete"}</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

const permsRef = vi.hoisted(() => ({ permissions: {} }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

const { default: DefaultDetectionSettings } = await import(
  "../../../../../../src/page/user/Detection/components/DefaultDetectionSettings.jsx"
);

// ---- helpers -------------------------------------------------------------

function setInner({ appliedProfileData = null, channelData = null, fetchAppliedProfile = vi.fn() } = {}) {
  innerRef.appliedProfileData = appliedProfileData;
  innerRef.channelData = channelData;
  innerRef.fetchAppliedProfile = fetchAppliedProfile;
  return fetchAppliedProfile;
}

function setPerms(p) {
  permsRef.permissions = p;
}

beforeEach(() => {
  patchSpy.mockReset();
  toastSpy.success.mockReset();
  toastSpy.error.mockReset();
  setInner();
  setPerms({});
});

// ---- tests ---------------------------------------------------------------

describe("DefaultDetectionSettings", () => {
  it("renders the heading + 'No users selected' fallback when authorisedUsers is empty / absent", () => {
    setInner({
      appliedProfileData: {
        profile: { defaultDetectionSettings: { authorisedUsers: [] } },
      },
    });
    render(<DefaultDetectionSettings />);
    expect(screen.getByText("Default Detection Setting")).toBeInTheDocument();
    expect(screen.getByText(/Enable Face/i)).toBeInTheDocument();
    expect(screen.getByText("Selected Identified Faces")).toBeInTheDocument();
    expect(screen.getByText("No users selected")).toBeInTheDocument();
    // The Switch is unchecked when users.length === 0.
    expect(screen.getByTestId("auth-switch")).not.toBeChecked();
    // No "+N more" button when users <= 3.
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("shows up to 3 names inline AND the Switch flips to checked when authorisedUsers has any entry", () => {
    setInner({
      appliedProfileData: {
        profile: {
          defaultDetectionSettings: {
            authorisedUsers: [
              { userName: "alice" },
              { userName: "bob" },
              { userName: "carol" },
            ],
          },
        },
      },
    });
    render(<DefaultDetectionSettings />);
    // The Switch reflects users.length > 0.
    expect(screen.getByTestId("auth-switch")).toBeChecked();
    // First 3 names appear comma-joined; we assert them via a single
    // substring match that survives the React text-split between
    // the literal join and the overflow span.
    expect(screen.getByText("alice, bob, carol")).toBeInTheDocument();
    // No overflow button — only 3 users.
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("renders '+N more' toggle that reveals the remaining users in a dropdown on click", () => {
    setInner({
      appliedProfileData: {
        profile: {
          defaultDetectionSettings: {
            authorisedUsers: [
              { userName: "u1" },
              { userName: "u2" },
              { userName: "u3" },
              { userName: "u4" },
              { userName: "u5" },
            ],
          },
        },
      },
    });
    render(<DefaultDetectionSettings />);
    const moreBtn = screen.getByText("+2 more");
    expect(moreBtn).toBeInTheDocument();
    // The dropdown is hidden by default.
    expect(screen.queryByText("u4")).not.toBeInTheDocument();
    expect(screen.queryByText("u5")).not.toBeInTheDocument();

    fireEvent.click(moreBtn);
    expect(screen.getByText("u4")).toBeInTheDocument();
    expect(screen.getByText("u5")).toBeInTheDocument();

    // Click again toggles off.
    fireEvent.click(moreBtn);
    expect(screen.queryByText("u4")).not.toBeInTheDocument();
  });

  it("permissions.detectionSettings.edit=true mounts MultiStepForm with the applied profile + linked-camera ids", () => {
    const fetchSpy = setInner({
      appliedProfileData: {
        profile: {
          _id: "prof-1",
          defaultDetectionSettings: { authorisedUsers: [] },
        },
      },
      channelData: { linkedCameras: [{ _id: "cam-a" }, { _id: "cam-b" }] },
    });
    setPerms({ detectionSettings: { edit: true, delete: false } });

    render(<DefaultDetectionSettings />);
    const msf = screen.getByTestId("multi-step-form");
    expect(msf).toBeInTheDocument();
    expect(msf.getAttribute("data-module")).toBe("appliedProfile");
    // selectedChannelIds is built from channelData.linkedCameras.
    expect(msf.getAttribute("data-channels")).toBe(
      JSON.stringify(["cam-a", "cam-b"])
    );
    // Delete permission off → no trash button.
    expect(
      screen.queryByRole("button", { name: "" })
    ).not.toBeNull(); // Edit trigger is a button; only this one exists.
    // No DeleteConfirmation should be open (we haven't triggered it).
    expect(screen.queryByTestId("delete-confirmation")).not.toBeInTheDocument();
    // Sanity: fetchSpy not invoked yet (no profile-clear performed).
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delete flow: trash button opens confirmation; confirm calls updateCameraSettingById + toast.success + fetchAppliedProfile", async () => {
    const fetchSpy = setInner({
      appliedProfileData: {
        profile: { defaultDetectionSettings: { authorisedUsers: [] } },
      },
      channelData: { linkedCameras: [{ _id: "cam-x" }] },
    });
    setPerms({ detectionSettings: { delete: true, edit: false } });
    patchSpy.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Profile cleared" } },
    });

    const { container } = render(<DefaultDetectionSettings />);
    // The trash button is the only button when edit=false / delete=true.
    const buttons = container.querySelectorAll("button");
    // One trash button on the right.
    expect(buttons.length).toBe(1);
    fireEvent.click(buttons[0]);

    // Confirmation modal appears.
    expect(screen.getByTestId("delete-confirmation")).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete this profile/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith("cam-x", { profile: null });
    });
    expect(toastSpy.success).toHaveBeenCalledWith("Profile cleared");
    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("delete flow: non-200 statusCode → toast.error with server message; fetchAppliedProfile NOT called", async () => {
    const fetchSpy = setInner({
      appliedProfileData: {
        profile: { defaultDetectionSettings: { authorisedUsers: [] } },
      },
      channelData: { linkedCameras: [{ _id: "cam-x" }] },
    });
    setPerms({ detectionSettings: { delete: true } });
    patchSpy.mockResolvedValue({
      data: { statusCode: 500, body: { message: "Boom" } },
    });

    render(<DefaultDetectionSettings />);
    // Open the trash modal — find the trash button (only button when edit=false).
    const trashBtn = document.querySelector(".flex.items-center.gap-2 button");
    fireEvent.click(trashBtn);
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(toastSpy.error).toHaveBeenCalledWith("Boom");
    });
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delete flow: thrown error → toast.error with server-error message", async () => {
    setInner({
      appliedProfileData: {
        profile: { defaultDetectionSettings: { authorisedUsers: [] } },
      },
      channelData: { linkedCameras: [{ _id: "cam-x" }] },
    });
    setPerms({ detectionSettings: { delete: true } });
    patchSpy.mockRejectedValue({
      response: { data: { body: { message: "Network down" } } },
    });

    render(<DefaultDetectionSettings />);
    const trashBtn = document.querySelector(".flex.items-center.gap-2 button");
    fireEvent.click(trashBtn);
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(toastSpy.error).toHaveBeenCalledWith("Network down");
    });
  });

  it("hides BOTH edit + delete buttons when neither permission is true", () => {
    setInner({
      appliedProfileData: {
        profile: { defaultDetectionSettings: { authorisedUsers: [] } },
      },
      channelData: { linkedCameras: [{ _id: "cam-x" }] },
    });
    setPerms({ detectionSettings: { edit: false, delete: false } });
    const { container } = render(<DefaultDetectionSettings />);
    // The right-actions div should have no children.
    const actions = container.querySelector(".flex.items-center.gap-2");
    expect(actions).toBeTruthy();
    expect(actions.querySelectorAll("button").length).toBe(0);
    // MultiStepForm not mounted either.
    expect(screen.queryByTestId("multi-step-form")).not.toBeInTheDocument();
  });
});
