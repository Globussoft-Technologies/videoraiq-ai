/**
 * src/page/user/Detection/components/Innersettings.jsx — the parent
 * Detection Settings page mounted from the camera-row detection link.
 * Reads `rowData / channelData / currentNvr` off useLocation().state,
 * derives `selectedChannelIds` from channelData.linkedCameras[*]._id,
 * and orchestrates four children: <Header />, <LiveFeedSection />,
 * <DeviceDetail />, <SettingsCard />, plus a <ProfileSelectionDialog />
 * and a <ResetConfirmationDialog />.
 *
 * On mount it calls getAppliedProfile(channelId) when channelId is
 * truthy. The reset dialog confirm flow re-fetches the applied profile
 * and either deletes a per-type detection setting (when one exists for
 * selectedsettingType) or surfaces an error/profile-reset toast.
 *
 * Mocks (8 — at the budget):
 *   1. ./InnerSettingsContext        — InnerSettingsProvider passthrough
 *                                       (captures `value` for assertions).
 *   2. ./Header                       — stub with testid + onBack click.
 *   3. ./LiveFeedSection              — stub.
 *   4. ./DeviceDetail                 — stub.
 *   5. ./SettingsCard                 — stub.
 *   6. ./ProfileSelectionDialog       — stub.
 *   7. @/components/ui/ResetConfirmationDialog
 *                                     — stub that exposes the onConfirm
 *                                       handler via a button.
 *   8. react-router-dom + sonner + the Api modules — shared spy bag
 *      (counts as one logical mock pair; sonner toast also stubbed).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ---- hoisted spies -------------------------------------------------------

const navigateSpy = vi.hoisted(() => vi.fn());
const locationRef = vi.hoisted(() => ({ state: null }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateSpy,
  useLocation: () => locationRef,
}));

const getAppliedProfileSpy = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Detection/Api/get", () => ({
  getAppliedProfile: getAppliedProfileSpy,
}));

const deleteDetectionSettingsSpy = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Detection/Api/delete", () => ({
  deleteDetectionSettings: deleteDetectionSettingsSpy,
}));

const updateCameraSettingByIdSpy = vi.hoisted(() => vi.fn());
// Private repo imports the corrected `patch` path; public mirror retains
// the legacy `pacth` typo. Mock both so the spec is parity-clean.
vi.mock("@/page/user/Streams/Api/patch", () => ({
  updateCameraSettingById: updateCameraSettingByIdSpy,
}));
vi.mock("@/page/user/Streams/Api/pacth", () => ({
  updateCameraSettingById: updateCameraSettingByIdSpy,
}));

const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastSpy }));

// Capture the provider value so we can assert the bag contents.
const innerProviderCapture = vi.hoisted(() => ({ value: null }));
vi.mock(
  "@/page/user/Detection/components/InnerSettingsContext",
  () => ({
    InnerSettingsProvider: ({ children, value }) => {
      innerProviderCapture.value = value;
      return <div data-testid="inner-provider">{children}</div>;
    },
    useInnerSettings: () => innerProviderCapture.value || {},
  })
);

vi.mock("@/page/user/Detection/components/Header", () => ({
  default: () => <div data-testid="header">Header</div>,
}));
vi.mock("@/page/user/Detection/components/LiveFeedSection", () => ({
  default: (props) => (
    <div
      data-testid="live-feed"
      data-channel-id={props.channelData?.linkedCameras?.[0]?._id || ""}
    >
      LiveFeedSection
    </div>
  ),
}));
vi.mock("@/page/user/Detection/components/DeviceDetail", () => ({
  default: () => <div data-testid="device-detail">DeviceDetail</div>,
}));
vi.mock("@/page/user/Detection/components/SettingsCard", () => ({
  default: (props) => (
    <div
      data-testid="settings-card"
      data-has-applied={!!props.appliedProfile}
    >
      SettingsCard
    </div>
  ),
}));
vi.mock(
  "@/page/user/Detection/components/ProfileSelectionDialog",
  () => ({
    default: ({ open, onClose }) => (
      <div data-testid="profile-dialog" data-open={open ? "1" : "0"}>
        <button data-testid="profile-dialog-close" onClick={onClose}>x</button>
      </div>
    ),
  })
);

vi.mock("@/components/ui/ResetConfirmationDialog", () => ({
  default: ({ open, onClose, onConfirm }) => (
    <div data-testid="reset-dialog" data-open={open ? "1" : "0"}>
      <button data-testid="reset-confirm" onClick={onConfirm}>confirm</button>
      <button data-testid="reset-close" onClick={onClose}>close</button>
    </div>
  ),
}));

const { default: Innersettings } = await import(
  "../../../../../../src/page/user/Detection/components/Innersettings.jsx"
);

// ---- helpers -------------------------------------------------------------

function setLocationState(state) {
  locationRef.state = state;
}

beforeEach(() => {
  vi.clearAllMocks();
  locationRef.state = null;
  innerProviderCapture.value = null;
});

describe("Detection/components/Innersettings", () => {
  it(
    "renders the four child sections inside the InnerSettingsProvider and seeds the context bag with rowData / channelData / fetchAppliedProfile / onBack / dialog openers",
    async () => {
      setLocationState({
        rowData: { id: "row-1" },
        channelData: { linkedCameras: [{ _id: "cam-99" }] },
        currentNvr: { _id: "nvr-1" },
      });
      // No channelId-driven fetch resolved yet — return a structure that
      // does NOT match `status === 'success'` so appliedProfileData stays null.
      getAppliedProfileSpy.mockResolvedValue({ data: { body: { status: "ignore" } } });

      await act(async () => {
        render(<Innersettings />);
      });

      // Provider + the four children rendered.
      expect(screen.getByTestId("inner-provider")).toBeInTheDocument();
      expect(screen.getByTestId("header")).toBeInTheDocument();
      expect(screen.getByTestId("live-feed")).toHaveAttribute(
        "data-channel-id",
        "cam-99"
      );
      expect(screen.getByTestId("device-detail")).toBeInTheDocument();
      expect(screen.getByTestId("settings-card")).toHaveAttribute(
        "data-has-applied",
        "false"
      );

      // Mount-time fetch was issued against the first linkedCamera id.
      await waitFor(() =>
        expect(getAppliedProfileSpy).toHaveBeenCalledWith("cam-99")
      );

      // Context bag exposes the expected shape.
      const bag = innerProviderCapture.value;
      expect(bag).toBeTruthy();
      expect(bag.rowData).toEqual({ id: "row-1" });
      expect(bag.channelData).toEqual({ linkedCameras: [{ _id: "cam-99" }] });
      expect(typeof bag.fetchAppliedProfile).toBe("function");
      expect(typeof bag.onBack).toBe("function");
      expect(typeof bag.onOpenProfileDialog).toBe("function");
      expect(typeof bag.onReset).toBe("function");

      // onBack walks history back.
      bag.onBack();
      expect(navigateSpy).toHaveBeenCalledWith(-1);

      // Dialog open flags start closed.
      expect(screen.getByTestId("profile-dialog")).toHaveAttribute("data-open", "0");
      expect(screen.getByTestId("reset-dialog")).toHaveAttribute("data-open", "0");
    }
  );

  it(
    "skips the mount fetch when channelId is missing (no linkedCameras) — getAppliedProfile is not called and no error toast fires",
    async () => {
      setLocationState({
        rowData: null,
        channelData: { linkedCameras: [] },
        currentNvr: null,
      });

      await act(async () => {
        render(<Innersettings />);
      });

      expect(getAppliedProfileSpy).not.toHaveBeenCalled();
      expect(toastSpy.error).not.toHaveBeenCalled();
      // The SettingsCard still mounts but with no applied profile.
      expect(screen.getByTestId("settings-card")).toHaveAttribute(
        "data-has-applied",
        "false"
      );
    }
  );

  it(
    "reset-confirm flow: when getAppliedProfile resolves with a per-type detection, deleteDetectionSettings is invoked with that id and a success toast fires",
    async () => {
      setLocationState({
        channelData: { linkedCameras: [{ _id: "cam-1" }] },
      });

      // First mount fetch — ignored for status purposes.
      getAppliedProfileSpy
        .mockResolvedValueOnce({ data: { body: { status: "ignore" } } })
        // The confirm re-fetch resolves with a populated detections map.
        // selectedsettingType is initially '' (empty string), which is a
        // valid object key — so we put the detection under the '' key.
        .mockResolvedValueOnce({
          data: {
            body: {
              status: "success",
              data: {
                channel: {
                  detections: {
                    "": { id: { _id: "det-77" } },
                  },
                },
              },
            },
          },
        });
      deleteDetectionSettingsSpy.mockResolvedValue({ data: { ok: true } });
      // The follow-up handleApplyProfile -> updateCameraSettingById is invoked
      // with `'no need'` so it does NOT toast (verifies the silent-success arm).
      updateCameraSettingByIdSpy.mockResolvedValue({
        data: { statusCode: 200, body: { message: "ok" } },
      });

      await act(async () => {
        render(<Innersettings />);
      });

      // Wait for mount fetch to resolve.
      await waitFor(() =>
        expect(getAppliedProfileSpy).toHaveBeenCalledTimes(1)
      );

      // Fire the reset confirm.
      await act(async () => {
        fireEvent.click(screen.getByTestId("reset-confirm"));
      });

      await waitFor(() => {
        expect(deleteDetectionSettingsSpy).toHaveBeenCalledWith("det-77");
      });
      expect(toastSpy.success).toHaveBeenCalledWith(
        "Detection settings reset successfully."
      );
      // updateCameraSettingById was called with profile:null and the silent flag.
      expect(updateCameraSettingByIdSpy).toHaveBeenCalledWith("cam-1", {
        profile: null,
      });
    }
  );

  it(
    "reset-confirm flow: with no matching detection and no profile on the channel, surfaces toast.error('No detection settings found to reset.')",
    async () => {
      setLocationState({
        channelData: { linkedCameras: [{ _id: "cam-2" }] },
      });

      getAppliedProfileSpy
        .mockResolvedValueOnce({ data: { body: { status: "ignore" } } })
        // Re-fetch returns success but with no detections.
        .mockResolvedValueOnce({
          data: {
            body: {
              status: "success",
              data: {
                channel: {
                  detections: {},
                  profile: null,
                },
              },
            },
          },
        });
      updateCameraSettingByIdSpy.mockResolvedValue({
        data: { statusCode: 200, body: { message: "ok" } },
      });

      await act(async () => {
        render(<Innersettings />);
      });
      await waitFor(() =>
        expect(getAppliedProfileSpy).toHaveBeenCalledTimes(1)
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("reset-confirm"));
      });

      await waitFor(() => {
        expect(toastSpy.error).toHaveBeenCalledWith(
          "No detection settings found to reset."
        );
      });
      // deleteDetectionSettings should NOT have been called.
      expect(deleteDetectionSettingsSpy).not.toHaveBeenCalled();
    }
  );
});
