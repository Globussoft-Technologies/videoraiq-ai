/**
 * src/page/user/Detection/components/AddNewConfiguration.jsx — the
 * collapsible "Add New / Edit Configurations Settings" panel used by
 * the legacy DetectionSetting page. On mount it calls
 * getAllDetectionTypes() (Api/get) and turns the returned
 * detectionTypes object ({key:label}) into a react-select options
 * array. The header chevron toggles isExpanded; when collapsed the
 * body is hidden. Once the user picks a type, the panel renders
 * DetectionSettingsForm (./ManageSettings) and forwards the type +
 * the addedDetection setter + the local isExpanded state.
 *
 * Mocks (3):
 *   1. react-select — heavy dropdown; stub with a plain <select> that
 *      surfaces the option keys we pass in (and lets us pick one).
 *   2. ./ManageSettings — the real form pulls in many heavy deps;
 *      stub with a passthrough that surfaces the props it receives.
 *   3. ../Api/get → getAllDetectionTypes — control the fetched
 *      detectionTypes object across the three branches (populated /
 *      empty / failure).
 *   4. @/components/ui/button — keep the real Tailwind shell as a
 *      plain button (no real Radix slot magic needed here).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-select", () => ({
  default: ({ options = [], onChange, placeholder, value, getOptionLabel, getOptionValue }) => (
    <select
      data-testid="type-select"
      value={value ? getOptionValue(value) : ""}
      onChange={(e) => {
        const next = options.find((o) => getOptionValue(o) === e.target.value);
        onChange(next || null);
      }}
    >
      <option value="">{placeholder || ""}</option>
      {options.map((opt) => (
        <option key={getOptionValue(opt)} value={getOptionValue(opt)}>
          {getOptionLabel(opt)}
        </option>
      ))}
    </select>
  ),
}));

vi.mock(
  "../../../../../../src/page/user/Detection/components/ManageSettings",
  () => ({
    default: ({ selectedType, isExpanded, setIsExpanded, setSelectedType, setAddedDetection }) => (
      <div
        data-testid="manage-settings"
        data-selected-type={selectedType ?? ""}
        data-is-expanded={String(!!isExpanded)}
      >
        <button data-testid="ms-collapse" onClick={() => setIsExpanded(false)}>
          collapse
        </button>
        <button data-testid="ms-clear" onClick={() => setSelectedType("")}>
          clear
        </button>
        <button
          data-testid="ms-add"
          onClick={() => setAddedDetection && setAddedDetection({ ok: true })}
        >
          add
        </button>
      </div>
    ),
  })
);

const getAllDetectionTypesMock = vi.hoisted(() => vi.fn());
vi.mock(
  "../../../../../../src/page/user/Detection/Api/get",
  () => ({
    getAllDetectionTypes: getAllDetectionTypesMock,
  })
);

const { default: AddNewConfiguration } = await import(
  "../../../../../../src/page/user/Detection/components/AddNewConfiguration.jsx"
);

beforeEach(() => {
  getAllDetectionTypesMock.mockReset();
});

describe("AddNewConfiguration", () => {
  it("shows the 'Add New Configure Settings' heading by default and expanded body", async () => {
    getAllDetectionTypesMock.mockResolvedValue({
      data: { body: { data: { detectionTypes: { fire: "Fire", smoke: "Smoke" } } } },
    });
    render(<AddNewConfiguration />);
    expect(
      screen.getByText(/Add New Configure Settings/i)
    ).toBeInTheDocument();
    // The "Select Detection Type" string appears as both the label and the
    // placeholder <option>; we just confirm the <label> renders.
    expect(
      screen.getByText("Select Detection Type", { selector: "label" })
    ).toBeInTheDocument();
    // The fetched options eventually appear inside the stubbed select.
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Fire" })).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "Smoke" })).toBeInTheDocument();
    // No type chosen yet -> ManageSettings is not rendered.
    expect(screen.queryByTestId("manage-settings")).not.toBeInTheDocument();
  });

  it("switches the heading to 'Edit Configurations Settings' when isEdit is true", async () => {
    getAllDetectionTypesMock.mockResolvedValue({
      data: { body: { data: { detectionTypes: {} } } },
    });
    render(<AddNewConfiguration isEdit={true} />);
    expect(
      screen.getByText(/Edit Configurations Settings/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Add New Configure Settings/i)
    ).not.toBeInTheDocument();
  });

  it("collapses and re-expands the body when the header is clicked", async () => {
    getAllDetectionTypesMock.mockResolvedValue({
      data: { body: { data: { detectionTypes: {} } } },
    });
    render(<AddNewConfiguration />);
    const header = screen.getByText(/Add New Configure Settings/i);
    // Initially expanded: the inner <label> is visible.
    expect(
      screen.getByText("Select Detection Type", { selector: "label" })
    ).toBeInTheDocument();

    fireEvent.click(header);
    expect(
      screen.queryByText("Select Detection Type", { selector: "label" })
    ).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(
      screen.getByText("Select Detection Type", { selector: "label" })
    ).toBeInTheDocument();
  });

  it("renders ManageSettings only after a detection type is selected and forwards props", async () => {
    getAllDetectionTypesMock.mockResolvedValue({
      data: { body: { data: { detectionTypes: { fire: "Fire", smoke: "Smoke" } } } },
    });
    const setAdded = vi.fn();
    render(<AddNewConfiguration setAddedDetection={setAdded} />);

    // Wait for options to render before changing selection.
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Smoke" })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("type-select"), {
      target: { value: "smoke" },
    });

    const ms = await screen.findByTestId("manage-settings");
    expect(ms).toBeInTheDocument();
    expect(ms.getAttribute("data-selected-type")).toBe("smoke");
    expect(ms.getAttribute("data-is-expanded")).toBe("true");

    // setAddedDetection is wired through to ManageSettings.
    fireEvent.click(screen.getByTestId("ms-add"));
    expect(setAdded).toHaveBeenCalledWith({ ok: true });
  });

  it("lets the inner ManageSettings clear selectedType to unmount itself", async () => {
    getAllDetectionTypesMock.mockResolvedValue({
      data: { body: { data: { detectionTypes: { fire: "Fire" } } } },
    });
    render(<AddNewConfiguration />);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Fire" })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("type-select"), {
      target: { value: "fire" },
    });
    expect(await screen.findByTestId("manage-settings")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ms-clear"));
    // After clearing, the form unmounts.
    await waitFor(() =>
      expect(screen.queryByTestId("manage-settings")).not.toBeInTheDocument()
    );
  });

  it("handles an API failure by leaving the type list empty (no options, no crash)", async () => {
    getAllDetectionTypesMock.mockRejectedValue(new Error("boom"));
    render(<AddNewConfiguration />);
    // Header still renders.
    expect(
      screen.getByText(/Add New Configure Settings/i)
    ).toBeInTheDocument();
    // The select stays empty (just the placeholder option) after the
    // catch branch is hit. We can't trivially wait on a rejected
    // promise, but waitFor with the mock having been called suffices.
    await waitFor(() => expect(getAllDetectionTypesMock).toHaveBeenCalled());
    const select = screen.getByTestId("type-select");
    // Only the placeholder <option value=""> should exist.
    expect(select.querySelectorAll("option")).toHaveLength(1);
  });
});
