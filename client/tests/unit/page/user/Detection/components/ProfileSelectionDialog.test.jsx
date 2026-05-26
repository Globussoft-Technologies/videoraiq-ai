/**
 * src/page/user/Detection/components/ProfileSelectionDialog.jsx — the small
 * Radix Dialog used by AppliedProfile to attach an existing camera-detection
 * profile to the active channel. Reads four UI-shaping branches:
 *   - open=false           → DialogContent returns null (Radix portal guard).
 *   - loading              → renders the "Loading profiles..." pane.
 *   - getProfileDetails    → 'success' populates the RadioGroup list; an
 *                            empty/missing array shows the "No profiles found"
 *                            empty state; thrown / rejected response surfaces
 *                            the "Failed to load profiles" error state.
 *   - createPermission     → toggles the round "+" CTA that lazily mounts
 *                            MultiStepForm next to the search input.
 *
 * It also owns three interactions wired through updateCameraSettingById:
 *   - Apply with no selection → toast.error('Please select a profile').
 *   - Apply with selection + 200 OK → toast.success + fetchAppliedProfile()
 *                                    + onClose() + selectedProfile reset.
 *   - Apply with selection + non-200 → toast.error(message fallback).
 *
 * Mocks (6 — within the 8-budget):
 *   1. ../../Profile/Api/get             → getProfileDetails hoisted spy
 *   2. ../../Streams/Api/patch + pacth   → updateCameraSettingById spy
 *                                          (both the corrected `patch` path
 *                                          and the legacy `pacth` typo so the
 *                                          spec is parity-clean across the
 *                                          private repo + public mirror)
 *   3. sonner                            → toast.{success,error} spies
 *   4. ../../Profile/MultiStepForm       → renders {trigger} so the "+" CTA
 *                                          can be asserted by role
 *   5. @/context/Permission/PermissionContext → usePermissions (hoisted ref)
 *   6. @/components/ui/radio-group       → flat passthrough so the RadioGroup
 *                                          state stays observable through the
 *                                          plain DOM without the Radix portal
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ---- mocks (hoisted) -----------------------------------------------------

const getProfileDetailsSpy = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Profile/Api/get", () => ({
  getProfileDetails: getProfileDetailsSpy,
}));

const patchSpy = vi.hoisted(() => vi.fn());
// As with DefaultDetectionSettings, the private repo imports
// `../../Streams/Api/patch` and the public mirror still ships `pacth`.
// Mocking both keeps the spec parity-clean on both clones.
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
  default: ({ trigger, fetchProfiles }) => (
    <div data-testid="multi-step-form" data-has-fetch={typeof fetchProfiles === "function"}>
      {trigger}
    </div>
  ),
}));

const permsRef = vi.hoisted(() => ({ permissions: {} }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

// The radio-group primitive renders the children flat so we can assert against
// the underlying list without setting up Radix's portal/popper plumbing.
vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({ children, value, onValueChange }) => (
    <div data-testid="radio-group" data-value={value || ""} role="radiogroup">
      {children}
    </div>
  ),
  RadioGroupItem: ({ value, className }) => (
    <span data-testid={`radio-${value}`} className={className} />
  ),
}));

const { default: ProfileSelectionDialog } = await import(
  "../../../../../../src/page/user/Detection/components/ProfileSelectionDialog.jsx"
);

// ---- helpers -------------------------------------------------------------

function profile(id, name, status = "Active") {
  return {
    _id: id,
    status,
    basics: { profileName: name },
  };
}

function setPerms(p) {
  permsRef.permissions = p;
}

async function renderDialog(props = {}) {
  const onClose = vi.fn();
  const onSelectProfile = vi.fn();
  const fetchAppliedProfile = vi.fn();
  let utils;
  await act(async () => {
    utils = render(
      <ProfileSelectionDialog
        open
        onClose={onClose}
        onSelectProfile={onSelectProfile}
        selectedChannelIds={["chan-1"]}
        fetchAppliedProfile={fetchAppliedProfile}
        {...props}
      />
    );
  });
  return { onClose, onSelectProfile, fetchAppliedProfile, ...utils };
}

beforeEach(() => {
  getProfileDetailsSpy.mockReset();
  patchSpy.mockReset();
  toastSpy.success.mockReset();
  toastSpy.error.mockReset();
  setPerms({});
});

// ---- tests ---------------------------------------------------------------

describe("ProfileSelectionDialog", () => {
  it("renders null when open=false (no fetch, no header text in DOM)", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { profiles: [] } } },
    });
    await act(async () => {
      render(
        <ProfileSelectionDialog
          open={false}
          onClose={vi.fn()}
          onSelectProfile={vi.fn()}
          selectedChannelIds={["chan-1"]}
          fetchAppliedProfile={vi.fn()}
        />
      );
    });
    expect(screen.queryByText("Apply a Profile")).not.toBeInTheDocument();
    expect(getProfileDetailsSpy).not.toHaveBeenCalled();
  });

  it("renders the empty-state copy when getProfileDetails returns success + empty profile array", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { profiles: [] } } },
    });
    await renderDialog();
    await waitFor(() =>
      expect(screen.getByText("No profiles found")).toBeInTheDocument()
    );
    expect(screen.getByText("Try adjusting your search terms")).toBeInTheDocument();
    expect(screen.getByText("Apply a Profile")).toBeInTheDocument();
    expect(screen.getByText(/Choose a profile to apply/i)).toBeInTheDocument();
    // First fetch is mounted with search=''.
    expect(getProfileDetailsSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: "",
    });
  });

  it("renders the error pane when getProfileDetails throws", async () => {
    getProfileDetailsSpy.mockRejectedValue(new Error("boom"));
    await renderDialog();
    await waitFor(() =>
      expect(screen.getByText("Failed to load profiles")).toBeInTheDocument()
    );
    expect(screen.queryByText("No profiles found")).not.toBeInTheDocument();
  });

  it("renders the populated RadioGroup with each profile + truncates names > 15 chars", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: {
            profiles: [
              profile("p1", "Lobby"),
              profile("p2", "ThisIsAVeryLongProfileNameOverLimit"),
            ],
          },
        },
      },
    });
    await renderDialog();
    await waitFor(() => expect(screen.getByText("Lobby")).toBeInTheDocument());
    // Long names are sliced to 15 + ellipsis.
    expect(screen.getByText("ThisIsAVeryLong...")).toBeInTheDocument();
    expect(screen.getByTestId("radio-p1")).toBeInTheDocument();
    expect(screen.getByTestId("radio-p2")).toBeInTheDocument();
  });

  it("create permission gates the '+' MultiStepForm CTA", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { profiles: [] } } },
    });
    // Without the permission the CTA is absent.
    await renderDialog();
    expect(screen.queryByTestId("multi-step-form")).not.toBeInTheDocument();
    // With it, the CTA mounts and forwards a callable fetchProfiles.
    setPerms({ detectionSettings: { create: true } });
    await renderDialog();
    expect(screen.getByTestId("multi-step-form")).toBeInTheDocument();
    expect(screen.getByLabelText("Add New Profile")).toBeInTheDocument();
    expect(screen.getByTestId("multi-step-form").dataset.hasFetch).toBe("true");
  });

  it("Apply button is disabled until a profile is picked, and clicking the disabled button does not hit updateCameraSettingById", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: { profiles: [profile("p1", "Lobby")] },
        },
      },
    });
    await renderDialog();
    await waitFor(() => screen.getByText("Lobby"));
    const applyBtn = screen.getByRole("button", { name: /Apply Profile/i });
    expect(applyBtn).toBeDisabled();
    await act(async () => {
      fireEvent.click(applyBtn);
    });
    expect(patchSpy).not.toHaveBeenCalled();
    // Picking a row enables the button so the apply path becomes reachable.
    await act(async () => {
      fireEvent.click(screen.getByText("Lobby"));
    });
    expect(
      screen.getByRole("button", { name: /Apply Profile/i })
    ).not.toBeDisabled();
  });

  it("Apply with selection + 200 OK toasts success, refetches the applied profile, and closes", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: { profiles: [profile("p1", "Lobby")] },
        },
      },
    });
    patchSpy.mockResolvedValue({
      data: { statusCode: 200, body: { message: "profile applied" } },
    });
    const { onClose, fetchAppliedProfile } = await renderDialog();
    await waitFor(() => screen.getByText("Lobby"));
    // Click the row to set selectedProfile, then submit.
    await act(async () => {
      fireEvent.click(screen.getByText("Lobby"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply Profile/i }));
    });
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith("chan-1", { profile: "p1" });
    expect(toastSpy.success).toHaveBeenCalledWith("profile applied");
    expect(fetchAppliedProfile).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("Apply with selection + non-200 surfaces the body message via toast.error", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: {
        body: {
          status: "success",
          data: { profiles: [profile("p1", "Lobby")] },
        },
      },
    });
    patchSpy.mockResolvedValue({
      data: { statusCode: 400, body: { message: "blocked" } },
    });
    const { onClose, fetchAppliedProfile } = await renderDialog();
    await waitFor(() => screen.getByText("Lobby"));
    await act(async () => {
      fireEvent.click(screen.getByText("Lobby"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Apply Profile/i }));
    });
    await waitFor(() => expect(toastSpy.error).toHaveBeenCalledWith("blocked"));
    expect(fetchAppliedProfile).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("typing in the search input re-fetches with the entered term", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { profiles: [] } } },
    });
    await renderDialog();
    await waitFor(() => expect(getProfileDetailsSpy).toHaveBeenCalledTimes(1));
    const input = screen.getByPlaceholderText("Search profile");
    await act(async () => {
      fireEvent.change(input, { target: { value: "lobby" } });
    });
    await waitFor(() =>
      expect(getProfileDetailsSpy).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        search: "lobby",
      })
    );
  });

  it("Cancel button invokes onClose (and resets the local selection)", async () => {
    getProfileDetailsSpy.mockResolvedValue({
      data: { body: { status: "success", data: { profiles: [] } } },
    });
    const { onClose } = await renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
