/**
 * src/page/user/Streams/CameraDiscoveryModal.jsx — the "Manage Cameras"
 * Radix-style fixed overlay popped up by the Streams page to add or remove
 * cameras from an NVR's available-channel list. On mount it GETs
 * `${VITE_BACKEND}/api/v1/nvr/edit/${nvrId}` with an x-access-token header,
 * shows a Loader2 spinner while loading, surfaces an empty-state line when
 * the available list is empty, otherwise renders a list of checkbox labels
 * for each available camera (initial check + Added pill driven by isAdded
 * + dbId). The Save button computes diff sets (toAdd = newly checked,
 * toRemove = previously added but now unchecked), short-circuits with an
 * "No changes made" info toast + onClose when both lists are empty,
 * otherwise sends the FULL current selection in one call —
 *   addSelectedCameras({ nvrId, cameraIds: Array.from(selected) })
 * — backend reconciles by marking any omitted previously-added cameras as
 * removed. On success it toasts a parts-joined message ("N camera(s) added",
 * "M camera(s) removed", or both) + onSaved + onClose. On a non-success
 * response body it surfaces the error message and skips onSaved/onClose.
 * Cancel just calls onClose; the top-right X close-button also calls
 * onClose. While saving the Save button shows a "Saving..." label.
 *
 * (Post-pull rewrite: the old "per-removal removeCamera(dbId)" path was
 * removed in favour of a single bulk POST. Tests that previously asserted
 * removeCamera() calls were re-pinned accordingly.)
 *
 * Branches we exercise:
 *   - loading branch shows the Loader2 spinner (no camera rows yet)
 *   - empty branch renders "No cameras found on this NVR"
 *   - populated branch lists each camera with its Added pill iff isAdded
 *   - checkbox toggle updates the selected set
 *   - Save with no diff fires the "No changes made" info toast + onClose
 *   - Save with toAdd only calls addSelectedCameras with the new selection
 *     then toasts "N camera added" + onSaved + onClose
 *   - Save with toRemove only sends a shrunken cameraIds list and toasts
 *     "M camera removed"
 *   - Save error path: a non-success response from addSelectedCameras
 *     toasts the body.message error and skips onSaved + onClose
 *   - fetch failure: GET throws -> "Failed to load cameras from NVR"
 *     error toast + immediate onClose
 *   - the X button calls onClose
 *
 * Mocks (7 total — within the 8 budget):
 *   1) axios (named .get used for the initial GET)
 *   2) sonner toast (success / error / info)
 *   3) ./Api/post (addSelectedCameras)
 *   4) @/hooks/useHlsPlayer (CameraPreviewModal child uses it; stubbed no-op)
 *   5) @/utils/getAccessToken
 *   6) lucide-react (Loader2 + X + Play + Maximize2 + Minimize2 sentinels)
 *   7) @/components/ui/button (plain <button> passthrough so disabled flips
 *      pass through naturally)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const {
  mockAxiosGet,
  mockToast,
  mockAddSelectedCameras,
} = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  mockAddSelectedCameras: vi.fn(),
}));

vi.mock("axios", () => ({ default: { get: (...args) => mockAxiosGet(...args) } }));

vi.mock("sonner", () => ({ toast: mockToast }));

// Product file imports via the bare specifier `./Api/post` (no /index.jsx
// extension), so the relative mock path must match exactly what Vite
// resolves from src/page/user/Streams/.
vi.mock(
  "../../../../../src/page/user/Streams/Api/post",
  () => ({ addSelectedCameras: (...args) => mockAddSelectedCameras(...args) })
);

vi.mock("@/hooks/useHlsPlayer", () => ({
  default: () => {},
}));

vi.mock("../../../../../src/utils/getAccessToken.js", () => ({
  default: () => "tok-test",
}));

vi.mock("lucide-react", () => ({
  X: (props) => <span data-testid="icon-x" {...props} />,
  Loader2: (props) => <span data-testid="icon-loader" {...props} />,
  // Added by the post-pull preview-stream UI on Added cameras.
  Play: (props) => <span data-testid="icon-play" {...props} />,
  Maximize2: (props) => <span data-testid="icon-maximize" {...props} />,
  Minimize2: (props) => <span data-testid="icon-minimize" {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

import CameraDiscoveryModal from "../../../../../src/page/user/Streams/CameraDiscoveryModal.jsx";

const fakeAvailable = [
  { channelId: 1, name: "Lobby Cam", isAdded: false },
  { channelId: 2, name: "Garage Cam", isAdded: true, dbId: "db-2" },
  { channelId: 3, name: "Roof Cam", isAdded: false },
];

const okFetchResponse = (cams = fakeAvailable) => ({
  data: { body: { status: "success", data: { availableCameras: cams } } },
});

beforeEach(() => {
  mockAxiosGet.mockReset();
  mockAddSelectedCameras.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockToast.info.mockReset();
});

describe("Streams/CameraDiscoveryModal", () => {
  it("shows the Loader2 spinner while the initial GET is in-flight", async () => {
    let resolveGet;
    mockAxiosGet.mockReturnValue(
      new Promise((r) => {
        resolveGet = r;
      })
    );

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={vi.fn()} onSaved={vi.fn()} />
    );

    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
    expect(screen.queryByText(/No cameras found/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lobby Cam/)).not.toBeInTheDocument();

    await act(async () => {
      resolveGet(okFetchResponse([]));
    });
  });

  it("renders the empty-state line when the NVR returns zero cameras", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse([]));
    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={vi.fn()} onSaved={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByText(/No cameras found on this NVR/i)).toBeInTheDocument()
    );
  });

  it("renders each available camera and marks the already-added ones with the Added pill", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse());
    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={vi.fn()} onSaved={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText("Lobby Cam")).toBeInTheDocument());
    expect(screen.getByText("Garage Cam")).toBeInTheDocument();
    expect(screen.getByText("Roof Cam")).toBeInTheDocument();

    // Three channel labels.
    expect(screen.getByText("Channel 1")).toBeInTheDocument();
    expect(screen.getByText("Channel 2")).toBeInTheDocument();
    expect(screen.getByText("Channel 3")).toBeInTheDocument();

    // Only the already-added camera shows the Added pill.
    const addedPills = screen.getAllByText("Added");
    expect(addedPills).toHaveLength(1);

    // The initial selected set has exactly the already-added camera checked.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    // Order matches fakeAvailable indices.
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[2].checked).toBe(false);
  });

  it("Save with no diff (selection unchanged) fires the info toast + onClose and skips both Api calls", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse());
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={onClose} onSaved={onSaved} />
    );

    await waitFor(() => expect(screen.getByText("Garage Cam")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() =>
      expect(mockToast.info).toHaveBeenCalledWith("No changes made")
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockAddSelectedCameras).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Save with newly-checked cameras calls addSelectedCameras then toasts success + onSaved + onClose", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse());
    mockAddSelectedCameras.mockResolvedValue({
      data: { body: { status: "success" } },
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={onClose} onSaved={onSaved} />
    );

    await waitFor(() => expect(screen.getByText("Lobby Cam")).toBeInTheDocument());

    // Check the first not-yet-added camera (channelId 1, Lobby Cam).
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(mockAddSelectedCameras).toHaveBeenCalledTimes(1));
    // Post-pull: one bulk POST carrying the full current selection (the
    // backend reconciles additions vs. removals from the merged list).
    const [arg] = mockAddSelectedCameras.mock.calls[0];
    expect(arg.nvrId).toBe("nvr-1");
    // After ticking the newly-checked Lobby Cam (channelId 1) on top of the
    // already-added Garage Cam (channelId 2), cameraIds carries both.
    expect(arg.cameraIds).toEqual(expect.arrayContaining([1, 2]));
    expect(arg.cameraIds).toHaveLength(2);

    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith("1 camera added")
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Save with newly-unchecked cameras posts the shrunken selection and toasts the removal summary", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse());
    mockAddSelectedCameras.mockResolvedValue({
      data: { body: { status: "success" } },
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={onClose} onSaved={onSaved} />
    );

    await waitFor(() => expect(screen.getByText("Garage Cam")).toBeInTheDocument());

    // Uncheck the already-added Garage Cam (boxes[1]).
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]);

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    // Single bulk call with the now-empty selection — the previously added
    // Garage Cam is conspicuously absent from cameraIds, signalling removal.
    await waitFor(() => expect(mockAddSelectedCameras).toHaveBeenCalledTimes(1));
    const [arg] = mockAddSelectedCameras.mock.calls[0];
    expect(arg.nvrId).toBe("nvr-1");
    expect(arg.cameraIds).toEqual([]);

    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith("1 camera removed")
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Save with a failed addSelectedCameras response toasts the message and skips onSaved + onClose", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse());
    mockAddSelectedCameras.mockResolvedValue({
      data: { body: { status: "error", message: "limit reached" } },
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={onClose} onSaved={onSaved} />
    );

    await waitFor(() => expect(screen.getByText("Lobby Cam")).toBeInTheDocument());
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("limit reached")
    );
    expect(onSaved).not.toHaveBeenCalled();
    // onClose was NOT called from the save path (still rendered).
    expect(onClose).not.toHaveBeenCalled();
  });

  it("an axios GET failure on mount toasts the load error and calls onClose immediately", async () => {
    mockAxiosGet.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={onClose} onSaved={vi.fn()} />
    );

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to load cameras from NVR"
      )
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the X close-button (and Cancel) calls onClose", async () => {
    mockAxiosGet.mockResolvedValue(okFetchResponse());
    const onClose = vi.fn();

    render(
      <CameraDiscoveryModal nvrId="nvr-1" onClose={onClose} onSaved={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText("Lobby Cam")).toBeInTheDocument());

    // The X button is the one rendering the icon-x sentinel.
    const xIcon = screen.getByTestId("icon-x");
    fireEvent.click(xIcon.closest("button"));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Cancel button also calls onClose.
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
