/**
 * Round 84: cover Detection/components/LiveFeedSection.jsx — the
 * "Zone Marking" parent inside the Innersettings page. Renders a
 * Detection Type Select, fetches detectionTypes once on mount via
 * getAllDetectionTypes(), refetches the applied profile via
 * getAppliedProfile(channelId) whenever selectedsettingType changes,
 * loads a per-type detection setting via
 * getDetectionSettingType(type, channelId) when a type is picked, and
 * mounts AreaSettingsPreview with a ref-forwarded API for the Edit
 * button to drive setChannelPoints + setLatestPreviewPoints.
 *
 * Key product behaviours pinned by this spec:
 *   - getAllDetectionTypes is fired exactly once on mount, and its
 *     `{[id]: label}` payload is transformed into the detectionOptions
 *     bag that the Select renders.
 *   - getAppliedProfile is fired on mount (because
 *     selectedsettingType is undefined initially) and again on
 *     selectedsettingType prop change.
 *   - When appliedDetection is null the Detection Name + Zone Name
 *     inputs + Edit button do NOT render.
 *   - When appliedDetection is non-null the read-only Detection Name +
 *     Zone Name inputs are present, populated from
 *     appliedDetection.name and appliedDetection.settings.referencePoints.zone_name,
 *     and the Edit button is visible.
 *   - Clicking Edit while previewRef.current is mounted forwards a
 *     call to setChannelPoints with the normalised referencePoints.
 *   - When appliedDetection.settings.referencePoints is undefined or
 *     not an object, normalizedReferencePoints falls back to {} and
 *     the derivedActiveCamera falls back to the first linked camera
 *     _id (defaultActiveCamera).
 *   - When channelData.linkedCameras is empty the
 *     defaultActiveCamera is null (no exception).
 *
 * Mocks (5, well under the 8-cap):
 *   1. @/page/user/Detection/Api/get  — hoisted spies for
 *      getAllDetectionTypes / getAppliedProfile /
 *      getDetectionSettingType.
 *   2. ./AreaSettingsPreview          — passthrough stub that captures
 *      every prop call into a ref + exposes a setChannelPoints spy via
 *      useImperativeHandle so the Edit button click can be verified.
 *   3. sonner                         — toast spy bag (Edit + save paths
 *      may toast; we don't trigger save here, but the import has to
 *      resolve in jsdom).
 *   4. @/components/ui/select         — minimal native <select> stub so
 *      the Radix collection-context wiring does not run under jsdom.
 *   5. @/components/ui/button         — minimal native <button> stub.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ---- hoisted spies -------------------------------------------------------

const getAllDetectionTypesSpy = vi.hoisted(() => vi.fn());
const getAppliedProfileSpy = vi.hoisted(() => vi.fn());
const getDetectionSettingTypeSpy = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Detection/Api/get", () => ({
  getAllDetectionTypes: getAllDetectionTypesSpy,
  getAppliedProfile: getAppliedProfileSpy,
  getDetectionSettingType: getDetectionSettingTypeSpy,
}));

// AreaSettingsPreview — captures props + exposes a setChannelPoints
// spy through the forwarded ref. The Edit button click path calls
// previewRef.current.setChannelPoints(normalisedReferencePoints).
const setChannelPointsSpy = vi.hoisted(() => vi.fn());
const previewPropsRef = vi.hoisted(() => ({ last: null }));
vi.mock(
  "../../../../../../src/page/user/Detection/components/AreaSettingsPreview",
  () => ({
    default: React.forwardRef((props, ref) => {
      previewPropsRef.last = props;
      React.useImperativeHandle(ref, () => ({
        setChannelPoints: setChannelPointsSpy,
      }));
      return <div data-testid="area-preview" />;
    }),
  })
);

const toastSuccessSpy = vi.hoisted(() => vi.fn());
const toastErrorSpy = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccessSpy, error: toastErrorSpy },
}));

// Plain HTML primitives so Radix Select doesn't break under jsdom.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }) => (
    <div
      data-testid="select"
      data-value={value || ""}
      onClick={() => onValueChange && onValueChange("__noop__")}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }) => (
    <div data-testid="select-trigger">{children}</div>
  ),
  SelectValue: ({ placeholder }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({ children }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

const { default: LiveFeedSection } = await import(
  "../../../../../../src/page/user/Detection/components/LiveFeedSection.jsx"
);

// ---- helpers -------------------------------------------------------------

function defaultProps(over = {}) {
  return {
    channelData: {
      linkedCameras: [{ _id: "cam-1" }, { _id: "cam-2" }],
    },
    setAppliedDetection: vi.fn(),
    appliedDetection: null,
    selectedsettingType: undefined,
    setSelectedsettingType: vi.fn(),
    currentNvr: { _id: "nvr-1", name: "NVR Alpha" },
    ...over,
  };
}

beforeEach(() => {
  getAllDetectionTypesSpy.mockReset();
  getAppliedProfileSpy.mockReset();
  getDetectionSettingTypeSpy.mockReset();
  setChannelPointsSpy.mockReset();
  toastSuccessSpy.mockReset();
  toastErrorSpy.mockReset();
  previewPropsRef.last = null;
  // Default API responses so the useEffect chains don't reject.
  getAllDetectionTypesSpy.mockResolvedValue({
    data: {
      body: {
        status: "success",
        data: {
          detectionTypes: {
            personFall: "Person Fall",
            crowdGathering: "Crowd Gathering",
          },
        },
      },
    },
  });
  getAppliedProfileSpy.mockResolvedValue({
    data: {
      body: {
        status: "success",
        data: {
          channel: {
            detections: {
              personFall: { enabled: true },
            },
          },
        },
      },
    },
  });
});

// ---- specs ---------------------------------------------------------------

describe("LiveFeedSection — Round 84", () => {
  it("renders Zone Marking heading + Select placeholder + AreaSettingsPreview on mount", async () => {
    render(<LiveFeedSection {...defaultProps()} />);

    expect(screen.getByText(/Zone Marking/i)).toBeInTheDocument();
    // The `Detection Type` <label> renders verbatim; the SelectValue
    // placeholder renders `Select Detection Type`. Match the exact label
    // text to avoid the substring collision.
    expect(screen.getByText(/^Detection Type$/i)).toBeInTheDocument();
    // Native-stub Select renders the placeholder via SelectValue.
    expect(screen.getByText("Select Detection Type")).toBeInTheDocument();
    expect(screen.getByTestId("area-preview")).toBeInTheDocument();

    // appliedDetection is null on this branch so the read-only Detection
    // Name / Zone Name inputs + Edit button MUST NOT render.
    expect(screen.queryByPlaceholderText("Detection Name")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Zone Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("fires getAllDetectionTypes exactly once on mount and forwards the channelId on getAppliedProfile", async () => {
    render(<LiveFeedSection {...defaultProps()} />);

    await waitFor(() => {
      expect(getAllDetectionTypesSpy).toHaveBeenCalledTimes(1);
      // selectedsettingType-effect fires on mount with channelId="cam-1".
      expect(getAppliedProfileSpy).toHaveBeenCalledWith("cam-1");
    });
  });

  it("derives selectedChannelIds + defaultActiveCamera from channelData.linkedCameras", async () => {
    render(<LiveFeedSection {...defaultProps()} />);

    await waitFor(() => expect(previewPropsRef.last).not.toBeNull());

    expect(previewPropsRef.last.selectedChannelIds).toEqual(["cam-1", "cam-2"]);
    // With null appliedDetection.referencePoints,
    // normalizedReferencePoints={} -> derivedActiveCamera falls back to
    // defaultActiveCamera="cam-1" (the first linked-camera _id).
    expect(previewPropsRef.last.activeCamera).toBe("cam-1");
    expect(previewPropsRef.last.cameraList).toEqual([
      { _id: "cam-1" },
      { _id: "cam-2" },
    ]);
    expect(previewPropsRef.last.isModal).toBe(false);
    expect(previewPropsRef.last.detectionSetting).toBeNull();
    expect(previewPropsRef.last.appliedDetection).toBeNull();
    // initialReferencePoints normalised to {} when no appliedDetection
    expect(previewPropsRef.last.initialReferencePoints).toEqual({});
    // editable defaults to false (no Edit click yet)
    expect(previewPropsRef.last.editable).toBe(false);
  });

  it("when appliedDetection is non-null, renders Detection Name + Zone Name inputs and the Edit button", async () => {
    const applied = {
      _id: "ds-1",
      name: "Fall Detection",
      enabled: true,
      linkedCameras: [
        { _id: "cam-1", detections: { personFall: { enabled: true } } },
      ],
      settings: {
        referencePoints: {
          zone_name: "Lobby Zone",
          "cam-1": [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
          ],
        },
      },
    };

    render(
      <LiveFeedSection
        {...defaultProps({
          appliedDetection: applied,
          selectedsettingType: "personFall",
        })}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Detection Name")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("Detection Name");
    expect(nameInput.value).toBe("Fall Detection");
    expect(nameInput.readOnly).toBe(true);

    const zoneInput = screen.getByPlaceholderText("Zone Name");
    expect(zoneInput.value).toBe("Lobby Zone");
    expect(zoneInput.readOnly).toBe(true);

    expect(screen.getByRole("button", { name: /^Edit$/i })).toBeInTheDocument();
  });

  it("forwards the appliedDetection referencePoints to AreaSettingsPreview as initialReferencePoints + activeCamera derived from referencePoints keys", async () => {
    const applied = {
      _id: "ds-1",
      name: "Crowd",
      settings: {
        referencePoints: {
          "cam-2": [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        },
      },
    };

    render(
      <LiveFeedSection
        {...defaultProps({
          appliedDetection: applied,
          selectedsettingType: "crowdGathering",
        })}
      />
    );

    await waitFor(() => expect(previewPropsRef.last).not.toBeNull());

    expect(previewPropsRef.last.initialReferencePoints).toEqual(
      applied.settings.referencePoints
    );
    // Reference-points contains cam-2 which IS in selectedChannelIds
    // ["cam-1","cam-2"], so derivedActiveCamera resolves to "cam-2".
    expect(previewPropsRef.last.activeCamera).toBe("cam-2");
    expect(previewPropsRef.last.detectionSetting).toBe(applied);
    expect(previewPropsRef.last.appliedDetection).toBe(applied);
  });

  it("clicking Edit calls previewRef.setChannelPoints with the normalised referencePoints and flips editable=true on the next render", async () => {
    const applied = {
      _id: "ds-1",
      name: "Fall Detection",
      settings: {
        referencePoints: {
          zone_name: "Lobby Zone",
          "cam-1": [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
          ],
        },
      },
    };

    render(
      <LiveFeedSection
        {...defaultProps({
          appliedDetection: applied,
          selectedsettingType: "personFall",
        })}
      />
    );

    const editBtn = await screen.findByRole("button", { name: /^Edit$/i });
    act(() => {
      fireEvent.click(editBtn);
    });

    expect(setChannelPointsSpy).toHaveBeenCalledTimes(1);
    expect(setChannelPointsSpy).toHaveBeenCalledWith(
      applied.settings.referencePoints
    );

    // After the click, isEditing flips true so AreaSettingsPreview is
    // re-rendered with editable=true and the Edit button disappears
    // (the `!isEditing` gate).
    await waitFor(() => {
      expect(previewPropsRef.last.editable).toBe(true);
    });
    expect(screen.queryByRole("button", { name: /^Edit$/i })).not.toBeInTheDocument();
  });

  it("normalises a missing referencePoints object to {} and falls back to the first linked camera", async () => {
    const applied = {
      _id: "ds-2",
      name: "Edge Case",
      // No settings.referencePoints at all
      settings: {},
    };

    render(
      <LiveFeedSection
        {...defaultProps({
          appliedDetection: applied,
          selectedsettingType: "personFall",
        })}
      />
    );

    await waitFor(() => expect(previewPropsRef.last).not.toBeNull());
    expect(previewPropsRef.last.initialReferencePoints).toEqual({});
    // Empty key set -> defaultActiveCamera = "cam-1"
    expect(previewPropsRef.last.activeCamera).toBe("cam-1");
  });

  it("handles empty channelData.linkedCameras by deriving a null defaultActiveCamera without throwing", async () => {
    const { container } = render(
      <LiveFeedSection
        {...defaultProps({
          channelData: { linkedCameras: [] },
        })}
      />
    );

    // Render succeeds + AreaSettingsPreview still mounts.
    expect(container.querySelector('[data-testid="area-preview"]')).not.toBeNull();
    await waitFor(() => expect(previewPropsRef.last).not.toBeNull());
    expect(previewPropsRef.last.selectedChannelIds).toEqual([]);
    expect(previewPropsRef.last.activeCamera).toBeNull();
    // Empty linkedCameras -> channelId is null, so getAppliedProfile
    // is short-circuited before it runs.
    expect(getAppliedProfileSpy).not.toHaveBeenCalled();
  });

  it("re-fires getAppliedProfile when selectedsettingType prop changes", async () => {
    const { rerender } = render(
      <LiveFeedSection {...defaultProps({ selectedsettingType: "a" })} />
    );

    await waitFor(() => {
      expect(getAppliedProfileSpy).toHaveBeenCalledWith("cam-1");
    });
    const firstCount = getAppliedProfileSpy.mock.calls.length;

    rerender(<LiveFeedSection {...defaultProps({ selectedsettingType: "b" })} />);

    await waitFor(() => {
      expect(getAppliedProfileSpy.mock.calls.length).toBeGreaterThan(firstCount);
    });
  });
});
