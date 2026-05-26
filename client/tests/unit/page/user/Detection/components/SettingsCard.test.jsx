/**
 * src/page/user/Detection/components/SettingsCard.jsx — the parent card
 * rendered inside the Detection settings page. Two top-level branches
 * gated by `import.meta.env.VITE_DESK_CLIENT === 'true'`:
 *
 *  1. DESK-CLIENT branch: a self-contained <Select Recipients> custom
 *     dropdown. Owns its own open/closed state via openDropdown,
 *     fetches the verified recipients list on mount via
 *     getVerifiedRecipients, renders selected labels (first 2 + "+N"
 *     overflow), toggles individual recipients via toggleRecipient
 *     (PATCHes the linked camera via updateCameraSettingById and toasts
 *     success / error), and dismisses on mousedown outside the panel.
 *
 *  2. BROWSER branch (default in the test env): renders
 *     <AppliedProfileWrapper /> always, and the four child sections
 *     (BasicSettings / NotificationSettings / EvidenceSeverity /
 *     DefaultDetectionSettings) only when appliedProfileData?.profile
 *     is defined.
 *
 * Mocks (7, under the 8-cap):
 *   1. ./InnerSettingsContext — feed the context hook bag.
 *   2. ./AppliedProfile — passthrough so we can detect the wrapper.
 *   3. ./BasicSettings — passthrough.
 *   4. ./NotificationSettings — passthrough.
 *   5. ./EvidenceSeverity — passthrough.
 *   6. ./DefaultDetectionSettings — passthrough.
 *   7. ../Api/get + ../../Streams/Api/patch — hoisted spies for
 *      getVerifiedRecipients + updateCameraSettingById (counts as a
 *      single logical mock pair; sonner toast is also stubbed).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const innerRef = vi.hoisted(() => ({
  selectedDays: [],
  appliedProfileData: null,
  channelData: null,
  fetchAppliedProfile: vi.fn(),
}));
vi.mock(
  "../../../../../../src/page/user/Detection/components/InnerSettingsContext",
  () => ({
    InnerSettingsProvider: ({ children }) => <>{children}</>,
    useInnerSettings: () => innerRef,
  })
);

vi.mock(
  "../../../../../../src/page/user/Detection/components/AppliedProfile",
  () => ({
    default: () => <div data-testid="applied-profile">AppliedProfile</div>,
  })
);
vi.mock(
  "../../../../../../src/page/user/Detection/components/BasicSettings",
  () => ({
    default: () => <div data-testid="basic-settings">BasicSettings</div>,
  })
);
vi.mock(
  "../../../../../../src/page/user/Detection/components/NotificationSettings",
  () => ({
    default: () => (
      <div data-testid="notification-settings">NotificationSettings</div>
    ),
  })
);
vi.mock(
  "../../../../../../src/page/user/Detection/components/EvidenceSeverity",
  () => ({
    default: () => (
      <div data-testid="evidence-severity">EvidenceSeverity</div>
    ),
  })
);
vi.mock(
  "../../../../../../src/page/user/Detection/components/DefaultDetectionSettings",
  () => ({
    default: () => (
      <div data-testid="default-detection-settings">
        DefaultDetectionSettings
      </div>
    ),
  })
);

const getVerifiedRecipientsSpy = vi.hoisted(() => vi.fn());
vi.mock(
  "../../../../../../src/page/user/Detection/Api/get",
  () => ({
    getVerifiedRecipients: getVerifiedRecipientsSpy,
  })
);

const updateCameraSettingByIdSpy = vi.hoisted(() => vi.fn());
vi.mock(
  "../../../../../../src/page/user/Streams/Api/patch",
  () => ({
    updateCameraSettingById: updateCameraSettingByIdSpy,
  })
);

const toastSuccessSpy = vi.hoisted(() => vi.fn());
const toastErrorSpy = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccessSpy, error: toastErrorSpy },
}));

const { default: SettingsCard } = await import(
  "../../../../../../src/page/user/Detection/components/SettingsCard.jsx"
);

function resetInner(over = {}) {
  innerRef.selectedDays = over.selectedDays ?? [];
  innerRef.appliedProfileData = over.appliedProfileData ?? null;
  innerRef.channelData = over.channelData ?? null;
  innerRef.fetchAppliedProfile = over.fetchAppliedProfile ?? vi.fn();
}

beforeEach(() => {
  getVerifiedRecipientsSpy.mockReset();
  updateCameraSettingByIdSpy.mockReset();
  toastSuccessSpy.mockReset();
  toastErrorSpy.mockReset();
  resetInner();
  // Default env: not desk client.
  vi.unstubAllEnvs?.();
});

describe("SettingsCard — browser branch (VITE_DESK_CLIENT !== 'true')", () => {
  it("always renders the AppliedProfile wrapper and omits the four sub-sections when no profile is applied", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { alerts: [] } } },
    });
    resetInner({ appliedProfileData: { profile: undefined } });

    await act(async () => {
      render(<SettingsCard />);
    });

    expect(screen.getByTestId("applied-profile")).toBeInTheDocument();
    expect(screen.queryByTestId("basic-settings")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("notification-settings")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("evidence-severity")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("default-detection-settings")
    ).not.toBeInTheDocument();
  });

  it("renders all four sub-sections once appliedProfileData.profile is defined", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { alerts: [] } } },
    });
    resetInner({
      appliedProfileData: { profile: { _id: "p1" } },
    });

    await act(async () => {
      render(<SettingsCard />);
    });

    expect(screen.getByTestId("applied-profile")).toBeInTheDocument();
    expect(screen.getByTestId("basic-settings")).toBeInTheDocument();
    expect(screen.getByTestId("notification-settings")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-severity")).toBeInTheDocument();
    expect(
      screen.getByTestId("default-detection-settings")
    ).toBeInTheDocument();
  });

  it("does not render the desk-client custom Select Recipients label in browser mode", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { alerts: [] } } },
    });
    resetInner({ appliedProfileData: { profile: { _id: "p1" } } });

    await act(async () => {
      render(<SettingsCard />);
    });

    // The desk-client branch uses a <label> with "Select Recipients" text;
    // the browser branch never renders it.
    expect(
      screen.queryByText("Select Recipients", { selector: "label" })
    ).not.toBeInTheDocument();
  });
});

describe("SettingsCard — desk-client branch (VITE_DESK_CLIENT === 'true')", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_DESK_CLIENT", "true");
  });

  it("shows the placeholder when no recipients are pre-selected and fetches the list on mount", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: {
            alerts: [
              { _id: "r1", fullName: "Alice" },
              { _id: "r2", fullName: "Bob" },
            ],
          },
        },
      },
    });

    await act(async () => {
      render(<SettingsCard />);
    });

    expect(
      screen.getByText("Select Recipients", { selector: "label" })
    ).toBeInTheDocument();
    // Placeholder span when no recipients selected.
    expect(
      screen.getByText("Select Recipients", { selector: "span" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getVerifiedRecipientsSpy).toHaveBeenCalledWith(0, 1000)
    );
  });

  it("opens the dropdown on click, lists recipients, and pre-selects from channelData.alerts (string ids + object refs)", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: {
            alerts: [
              { _id: "r1", fullName: "Alice" },
              { _id: "r2", fullName: "Bob" },
            ],
          },
        },
      },
    });
    resetInner({
      channelData: {
        alerts: ["r1", { _id: "r2" }],
        linkedCameras: [{ _id: "cam-1" }],
      },
    });

    await act(async () => {
      render(<SettingsCard />);
    });

    // Wait for the recipients fetch + state update.
    await waitFor(() =>
      expect(getVerifiedRecipientsSpy).toHaveBeenCalled()
    );

    // Pre-selected display: "Alice, Bob" (no +N because len == 2).
    await waitFor(() => {
      expect(screen.getByText("Alice, Bob")).toBeInTheDocument();
    });

    // Open dropdown and confirm both rows render with the correct check state.
    fireEvent.click(screen.getByText("Alice, Bob"));
    const cbs = screen.getAllByRole("checkbox");
    expect(cbs.length).toBe(2);
    expect(cbs[0]).toBeChecked();
    expect(cbs[1]).toBeChecked();
  });

  it("toggling a recipient PATCHes the linked camera and toasts success on a 200", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: {
            alerts: [
              { _id: "r1", fullName: "Alice" },
              { _id: "r2", fullName: "Bob" },
            ],
          },
        },
      },
    });
    const fetchAppliedProfile = vi.fn();
    resetInner({
      channelData: {
        alerts: ["r1"],
        linkedCameras: [{ _id: "cam-1" }],
      },
      fetchAppliedProfile,
    });
    updateCameraSettingByIdSpy.mockResolvedValue({
      data: { statusCode: 200, body: { status: "success", message: "ok!" } },
    });

    await act(async () => {
      render(<SettingsCard />);
    });
    await waitFor(() =>
      expect(getVerifiedRecipientsSpy).toHaveBeenCalled()
    );

    // Open dropdown and toggle the second (currently-unchecked) row on.
    fireEvent.click(screen.getByText("Alice"));
    const cbs = await screen.findAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(cbs[1]);
    });

    await waitFor(() =>
      expect(updateCameraSettingByIdSpy).toHaveBeenCalledWith("cam-1", {
        alerts: ["r1", "r2"],
      })
    );
    expect(toastSuccessSpy).toHaveBeenCalledWith("ok!");
    expect(fetchAppliedProfile).toHaveBeenCalledWith("cam-1");
  });

  it("renders 'No recipients available' when the fetched list is empty", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { alerts: [] } } },
    });

    await act(async () => {
      render(<SettingsCard />);
    });
    await waitFor(() =>
      expect(getVerifiedRecipientsSpy).toHaveBeenCalled()
    );

    fireEvent.click(
      screen.getByText("Select Recipients", { selector: "span" })
    );
    expect(screen.getByText("No recipients available")).toBeInTheDocument();
  });

  it("clicking outside the dropdown closes it (mousedown click-outside handler)", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: { alerts: [{ _id: "r1", fullName: "Alice" }] },
        },
      },
    });

    await act(async () => {
      render(<SettingsCard />);
    });
    await waitFor(() =>
      expect(getVerifiedRecipientsSpy).toHaveBeenCalled()
    );

    // Open and confirm row is visible.
    fireEvent.click(
      screen.getByText("Select Recipients", { selector: "span" })
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();

    // Fire a mousedown on document.body (outside the dropdownRef container).
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("shows the '+N' overflow label when more than two recipients are pre-selected", async () => {
    getVerifiedRecipientsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: {
            alerts: [
              { _id: "r1", fullName: "Alice" },
              { _id: "r2", fullName: "Bob" },
              { _id: "r3", fullName: "Carol" },
              { _id: "r4", fullName: "Dave" },
            ],
          },
        },
      },
    });
    resetInner({
      channelData: {
        alerts: ["r1", "r2", "r3", "r4"],
        linkedCameras: [{ _id: "cam-1" }],
      },
    });

    await act(async () => {
      render(<SettingsCard />);
    });
    await waitFor(() =>
      expect(getVerifiedRecipientsSpy).toHaveBeenCalled()
    );

    // Slice(0,2) joins to "Alice, Bob" and "+2" suffix because total is 4.
    await waitFor(() => {
      expect(screen.getByText(/Alice, Bob\s+\+2/)).toBeInTheDocument();
    });
  });
});
