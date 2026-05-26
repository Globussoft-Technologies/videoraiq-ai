/**
 * Round 86: cover Detection/components/zonemarking/AreaMarkingControls.jsx
 * — the action-bar of buttons rendered beneath the zone-marking canvas
 * inside Innersettings / AreaSettingsPreview.
 *
 * Behaviour surfaces covered:
 *   1. isLoading=true short-circuits all the action buttons except the
 *      always-mounted ConfirmationModal portal — the component renders the
 *      wrapping div but no controls. With selectedType empty, the modal is
 *      closed by default so no "Are you sure" copy is in the DOM either.
 *   2. With a non-line `selectedType` ("intrusion") the bar mounts Max
 *      Area + Min Area + Start/Stop Drawing + Clear All + Save Area. The
 *      Draw Line button is suppressed because selectedType is not a line
 *      variant.
 *   3. With `selectedType === "lineCrossingSettings"` the Draw Line button
 *      appears and Max/Min/Start-Drawing are suppressed. handleToggleDrawing
 *      is a no-op for line types — clicking Start Drawing would have been
 *      hidden, but the Draw Line button must trigger handleSingleLinePlacement
 *      via the cameraStreamRef.setPoints/setMoveMode chain + setIsEditing.
 *   4. Max Area without a selectedType toasts "Please select Detection
 *      Type" and never reads cameraStreamRef.
 *   5. Max Area with selectedType pulls getResolution(), builds a five-
 *      point full-screen rect and writes it through setPoints/setDrawingMode
 *      (false)/setMoveMode(true).
 *   6. Min Area writes the documented 100..300 five-point rect.
 *   7. Start Drawing toggles drawingMode true and clears empty points
 *      (getPoints returns []) via clearPoints; on the second click the
 *      already-true drawingMode reverts to false.
 *   8. Save Area with no current points (getPoints returns []) toasts
 *      "Please draw an area before saving." and does NOT open the save
 *      modal. Save Area with points + a missing selectedsettingType toasts
 *      "Please select a detection type before saving" and does NOT open
 *      the save modal either.
 *   9. Save Area with points + selectedsettingType opens the save modal;
 *      submitting with both names blank surfaces both inline errors and
 *      does NOT call handleSaveAreaWithDetection; filling both names +
 *      submit calls handleSaveAreaWithDetection with the full payload and
 *      closes the modal.
 *
 * Mocks (4 — well within 8):
 *   1. sonner toast — capture validation toasts.
 *   2. @/components/ui/switch — neutral pass-through (unused in render but
 *      imported by the source).
 *   3. @/components/ui/select — flatten the Radix Select to a plain
 *      <select> so jsdom can interact with priority.
 *   4. ../DeleteConfirmation — controlled spy that renders a Confirm /
 *      Cancel pair when open=true so the Clear-All confirmation flow is
 *      observable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---- mocks (hoisted) -----------------------------------------------------

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, ...rest }) => (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
      {...rest}
    />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }) => (
    <div data-mock="select">
      <select
        data-testid="priority-select"
        value={value}
        onChange={(e) => onValueChange && onValueChange(e.target.value)}
      >
        <option value="high">High</option>
        <option value="moderate">Moderate</option>
        <option value="low">Low</option>
      </select>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ children, placeholder }) => <span>{children ?? placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
}));

vi.mock("../../../../../../../src/page/user/Detection/components/DeleteConfirmation", () => ({
  default: ({ open, onConfirm, onClose, title, message, confirmLabel }) =>
    open ? (
      <div data-testid="delete-confirmation">
        <div>{title}</div>
        <div data-testid="confirm-message">{message}</div>
        <button onClick={onConfirm}>{confirmLabel || "Confirm"}</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));
// The source imports DeleteConfirmation via the relative `../DeleteConfirmation`
// specifier (the file lives in src/page/user/Detection/components/zonemarking/).
vi.mock("@/page/user/Detection/components/DeleteConfirmation", () => ({
  default: ({ open, onConfirm, onClose, title, message, confirmLabel }) =>
    open ? (
      <div data-testid="delete-confirmation">
        <div>{title}</div>
        <div data-testid="confirm-message">{message}</div>
        <button onClick={onConfirm}>{confirmLabel || "Confirm"}</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

const { default: AreaMarkingControls } = await import(
  "../../../../../../../src/page/user/Detection/components/zonemarking/AreaMarkingControls.jsx"
);

// ---- helpers -------------------------------------------------------------

function makeRef({
  resolution = [1920, 1080],
  initialPoints = [],
  setPoints = vi.fn(),
  setDrawingMode = vi.fn(),
  setMoveMode = vi.fn(),
  clearPoints = vi.fn(),
  getResolution = vi.fn(() => resolution),
} = {}) {
  const refObj = {
    setPoints,
    setDrawingMode,
    setMoveMode,
    clearPoints,
    getResolution,
    getPoints: vi.fn(() => initialPoints),
  };
  return { current: refObj };
}

function renderControls(extra = {}) {
  const setDrawingMode = vi.fn();
  const setMoveMode = vi.fn();
  const setIsEditing = vi.fn();
  const handleSaveAreaWithDetection = vi.fn();
  const cameraStreamRef = extra.cameraStreamRef || makeRef();
  const props = {
    setDrawingMode,
    appliedDetection: null,
    selectedType: "",
    cameraStreamRef,
    handleOpenModal: vi.fn(),
    selectedsettingType: "",
    drawingMode: false,
    moveMode: false,
    setMoveMode,
    setIsEditing,
    handleSaveAreaWithDetection,
    hasError: false,
    isLoading: false,
    ...extra,
  };
  const utils = render(<AreaMarkingControls {...props} />);
  return { ...utils, props, cameraStreamRef };
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});

// ---- tests ---------------------------------------------------------------

describe("AreaMarkingControls", () => {
  it("isLoading=true suppresses every action button (only the closed ConfirmationModal portal is mounted)", () => {
    renderControls({ isLoading: true });
    expect(screen.queryByText(/Max Area/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Min Area/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Start Drawing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stop Drawing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clear All/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Save Area/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Draw Line/)).not.toBeInTheDocument();
    // ConfirmationModal default open=false → not in DOM.
    expect(screen.queryByTestId("delete-confirmation")).not.toBeInTheDocument();
  });

  it("non-line selectedType mounts Max/Min/Start-Drawing/Clear All/Save Area but NOT Draw Line", () => {
    renderControls({ selectedType: "intrusion" });
    expect(screen.getByText("Max Area")).toBeInTheDocument();
    expect(screen.getByText("Min Area")).toBeInTheDocument();
    expect(screen.getByText("Start Drawing")).toBeInTheDocument();
    expect(screen.getByText("Clear All")).toBeInTheDocument();
    expect(screen.getByText("Save Area")).toBeInTheDocument();
    expect(screen.queryByText("Draw Line")).not.toBeInTheDocument();
  });

  it("lineCrossingSettings type mounts ONLY Draw Line (no Max/Min/Start-Drawing); clicking Draw Line writes the documented two-point line + flips moveMode", () => {
    const ref = makeRef();
    renderControls({ selectedType: "lineCrossingSettings", cameraStreamRef: ref });
    expect(screen.getByText("Draw Line")).toBeInTheDocument();
    expect(screen.queryByText("Max Area")).not.toBeInTheDocument();
    expect(screen.queryByText("Min Area")).not.toBeInTheDocument();
    expect(screen.queryByText("Start Drawing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Draw Line"));
    expect(ref.current.setPoints).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 300, y: 300 },
    ]);
    // After placement the bar flips drawingMode off + moveMode on through
    // the ref.
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
    expect(ref.current.setMoveMode).toHaveBeenLastCalledWith(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("Max Area without a selectedType toasts the 'Please select Detection Type' validation message and never touches the ref", () => {
    const ref = makeRef();
    renderControls({ selectedType: "", cameraStreamRef: ref });
    // selectedType="" → Max Area is suppressed, so we toggle to a non-line
    // type but flip the validation through selectedType property —
    // simulating the user clicking before picking a type means re-rendering
    // with selectedType set on the parent but selectedType passed empty
    // here.  Instead, we exercise the validation arm directly: trigger
    // Clear All (the only button visible when selectedType is empty).
    // No buttons render when selectedType is empty + isLoading=false:
    //   selectedType !== 'lineCrossingSettings' → false branch (since !=)
    //   selectedType === 'lineCrossingSettings' → false branch
    //   So Max Area / Min Area / Start Drawing render even with empty
    //   selectedType. Confirm that and exercise it.
    expect(screen.getByText("Max Area")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Max Area"));
    expect(toast.error).toHaveBeenCalledWith("Please select Detection Type");
    expect(ref.current.getResolution).not.toHaveBeenCalled();
    expect(ref.current.setPoints).not.toHaveBeenCalled();
  });

  it("Max Area with selectedType pulls getResolution + writes the documented 5-point full-screen rect + flips drawingMode off / moveMode on", () => {
    const ref = makeRef({ resolution: [800, 600] });
    renderControls({ selectedType: "intrusion", cameraStreamRef: ref });
    fireEvent.click(screen.getByText("Max Area"));
    expect(ref.current.getResolution).toHaveBeenCalledTimes(1);
    expect(ref.current.setPoints).toHaveBeenCalledWith([
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 600 },
      { x: 0, y: 600 },
      { x: 0, y: 0 },
    ]);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(true);
  });

  it("Min Area writes the documented 100..300 five-point rect", () => {
    const ref = makeRef();
    renderControls({ selectedType: "intrusion", cameraStreamRef: ref });
    fireEvent.click(screen.getByText("Min Area"));
    expect(ref.current.setPoints).toHaveBeenCalledWith([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
      { x: 100, y: 100 },
    ]);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(true);
  });

  it("Start Drawing with drawingMode=false flips drawingMode=true via the parent setter and clears empty points through clearPoints", () => {
    const ref = makeRef({ initialPoints: [] });
    const setDrawingMode = vi.fn();
    const setMoveMode = vi.fn();
    const setIsEditing = vi.fn();
    renderControls({
      selectedType: "intrusion",
      cameraStreamRef: ref,
      drawingMode: false,
      setDrawingMode,
      setMoveMode,
      setIsEditing,
    });
    fireEvent.click(screen.getByText("Start Drawing"));
    expect(setDrawingMode).toHaveBeenCalledWith(true);
    expect(setMoveMode).toHaveBeenCalledWith(false);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(true);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(false);
    expect(ref.current.clearPoints).toHaveBeenCalled();
    // The button's inline `setIsEditing(true)` after handleToggleDrawing fires.
    expect(setIsEditing).toHaveBeenCalledWith(true);
  });

  it("Stop Drawing arm: drawingMode=true flips back to false through both the parent setter and the ref", () => {
    const ref = makeRef();
    const setDrawingMode = vi.fn();
    renderControls({
      selectedType: "intrusion",
      cameraStreamRef: ref,
      drawingMode: true,
      setDrawingMode,
    });
    fireEvent.click(screen.getByText("Stop Drawing"));
    expect(setDrawingMode).toHaveBeenCalledWith(false);
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
  });

  it("Save Area with no current points (getPoints returns []) toasts 'Please draw an area before saving.' and does NOT open the save modal", () => {
    const ref = makeRef({ initialPoints: [] });
    renderControls({ selectedType: "intrusion", cameraStreamRef: ref });
    fireEvent.click(screen.getByText("Save Area"));
    expect(toast.error).toHaveBeenCalledWith("Please draw an area before saving.");
    // The save modal copy "Save Detection Area" is not rendered yet.
    expect(screen.queryByText("Save Detection Area")).not.toBeInTheDocument();
  });

  it("Save Area with points but no selectedsettingType toasts 'Please select a detection type before saving' and does NOT open the modal", () => {
    const ref = makeRef({ initialPoints: [{ x: 1, y: 1 }] });
    renderControls({
      selectedType: "intrusion",
      selectedsettingType: "",
      cameraStreamRef: ref,
    });
    fireEvent.click(screen.getByText("Save Area"));
    expect(toast.error).toHaveBeenCalledWith(
      "Please select a detection type before saving"
    );
    expect(screen.queryByText("Save Detection Area")).not.toBeInTheDocument();
  });

  it("Save Area + Submit happy path: opens the modal, filled-in names round-trip into handleSaveAreaWithDetection with the documented payload + closes the modal", () => {
    const ref = makeRef({ initialPoints: [{ x: 1, y: 1 }] });
    const handleSaveAreaWithDetection = vi.fn();
    renderControls({
      selectedType: "intrusion",
      selectedsettingType: "intrusion",
      cameraStreamRef: ref,
      handleSaveAreaWithDetection,
    });

    fireEvent.click(screen.getByText("Save Area"));
    expect(screen.getByText("Save Detection Area")).toBeInTheDocument();

    // Fill in Detection Name + Zone Name.
    const detectionNameInput = screen.getByPlaceholderText("Enter detection name");
    const zoneNameInput = screen.getByPlaceholderText("Enter zone name");
    fireEvent.change(detectionNameInput, { target: { value: "My Detection" } });
    fireEvent.change(zoneNameInput, { target: { value: "Lobby" } });

    fireEvent.click(screen.getByText("Submit"));

    expect(handleSaveAreaWithDetection).toHaveBeenCalledTimes(1);
    const payload = handleSaveAreaWithDetection.mock.calls[0][0];
    expect(payload.detectionName).toBe("My Detection");
    expect(payload.zoneName).toBe("Lobby");
    expect(payload.priority).toBe("moderate");
    // Modal closed after submit.
    expect(screen.queryByText("Save Detection Area")).not.toBeInTheDocument();
  });

  it("Save Area + Submit with both names blank: surfaces inline errors and does NOT call handleSaveAreaWithDetection", () => {
    const ref = makeRef({ initialPoints: [{ x: 1, y: 1 }] });
    const handleSaveAreaWithDetection = vi.fn();
    renderControls({
      selectedType: "intrusion",
      selectedsettingType: "intrusion",
      cameraStreamRef: ref,
      handleSaveAreaWithDetection,
    });
    fireEvent.click(screen.getByText("Save Area"));
    // Both inputs default to empty (no appliedDetection passed in).
    fireEvent.click(screen.getByText("Submit"));
    expect(handleSaveAreaWithDetection).not.toHaveBeenCalled();
    // Inline error messages surface for both fields.
    expect(
      screen.getByText("Detection Name is required")
    ).toBeInTheDocument();
    expect(screen.getByText("Zone Name is required")).toBeInTheDocument();
  });

  it("Clear All click opens the DeleteConfirmation portal; Confirm triggers clearPoints + setDrawingMode(false) flow on a non-line type", () => {
    const ref = makeRef({ initialPoints: [{ x: 1, y: 1 }] });
    renderControls({ selectedType: "intrusion", cameraStreamRef: ref });
    fireEvent.click(screen.getByText("Clear All"));
    const dlg = screen.getByTestId("delete-confirmation");
    expect(dlg).toBeInTheDocument();
    expect(screen.getByText("Clear Detection Area")).toBeInTheDocument();
    // Confirm fires handleDeleteArea — clears points + flips drawingMode false.
    fireEvent.click(dlg.querySelector("button"));
    expect(ref.current.clearPoints).toHaveBeenCalled();
    expect(ref.current.setDrawingMode).toHaveBeenCalledWith(false);
    expect(ref.current.setMoveMode).toHaveBeenCalledWith(false);
  });
});
