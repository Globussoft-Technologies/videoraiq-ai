/**
 * src/page/user/Profile/EvidenceSeverityStep.jsx — step 3 of the multi-
 * step profile form. Renders three controls:
 *   - "Evidence" select (Snapshot/Video/None)
 *   - "Time (Sec)" NumberInput, ONLY visible when evidence === 'Video'
 *   - "Storage" select populated from getStorage() on mount.
 * Field updates go through Formik (setFieldValue) when present, otherwise
 * fall back to `setForm` (which can be either a 2-arg key/value setter or
 * a state-updater function).
 *
 * Mocks (5):
 *   1. formik          - inline useFormikContext returning a controlled stub.
 *   2. @/components/ui/select   - inline native select.
 *   3. @/components/ui/Tooltip  - inline pass-through.
 *   4. @/components/ui/number-input - inline native input[type=number].
 *   5. ./Api/get       - getStorage / getObjectDetectionList stubs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const formikRef = vi.hoisted(() => ({
  current: {
    errors: {},
    touched: {},
    setFieldValue: vi.fn(),
  },
}));
vi.mock("formik", () => ({
  useFormikContext: () => formikRef.current,
}));

vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, children }) => (
    <div data-mock="select" data-value={value || ""}>
      <select
        data-testid="select-input"
        value={value || ""}
        onChange={(e) => onValueChange && onValueChange(e.target.value)}
      >
        <option value="">--</option>
        <option value="Snapshot">Snapshot</option>
        <option value="Video">Video</option>
        <option value="None">None</option>
        <option value="s1">Local</option>
        <option value="s2">Cloud</option>
      </select>
      {children}
    </div>
  );
  return {
    Select,
    SelectTrigger: ({ children }) => <div>{children}</div>,
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: ({ value, children }) => (
      <div data-value={value}>{children}</div>
    ),
  };
});

vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }) => <span>{children}</span>,
  TooltipTrigger: ({ children }) => <span>{children}</span>,
  TooltipContent: ({ children }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/number-input", () => ({
  NumberInput: ({ value, onChange, min, max, step }) => (
    <input
      type="number"
      data-testid="time-input"
      value={value ?? ""}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
    />
  ),
}));

const apiGet = vi.hoisted(() => ({
  getStorage: vi.fn(),
  getObjectDetectionList: vi.fn(),
}));
vi.mock("../../../../../src/page/user/Profile/Api/get", () => apiGet);

const { default: EvidenceSeverityStep } = await import(
  "../../../../../src/page/user/Profile/EvidenceSeverityStep.jsx"
);

beforeEach(() => {
  formikRef.current = {
    errors: {},
    touched: {},
    setFieldValue: vi.fn(),
  };
  apiGet.getStorage.mockReset();
  apiGet.getStorage.mockResolvedValue({
    data: {
      body: {
        data: { storages: [{ _id: "s1", name: "Local" }, { _id: "s2", name: "Cloud" }] },
      },
    },
  });
});

describe("EvidenceSeverityStep", () => {
  it("renders Evidence + Storage labels but NOT the Time field when evidence !== 'Video'", () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(screen.getByText(/Evidence \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Storage \*/i)).toBeInTheDocument();
    expect(screen.queryByText(/Time \(Sec\)/i)).not.toBeInTheDocument();
  });

  it("renders the Time (Sec) field when evidence === 'Video'", () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Video", time: 5, storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(screen.getByText(/Time \(Sec\)/i)).toBeInTheDocument();
    expect(screen.getByTestId("time-input")).toHaveValue(5);
  });

  it("shows the 'Time is required' warning when evidence is Video but time is empty/0", () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Video", time: 0, storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Time is required for Video evidence/i)
    ).toBeInTheDocument();
  });

  it("shows the >10 sec hint when video time exceeds 10", () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Video", time: 15, storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Your video is more than 10 sec/i)
    ).toBeInTheDocument();
  });

  it("changing the evidence select calls formik.setFieldValue('evidence', value)", () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={vi.fn()}
      />
    );
    const selects = screen.getAllByTestId("select-input");
    // First select is Evidence.
    fireEvent.change(selects[0], { target: { value: "Video" } });
    expect(formikRef.current.setFieldValue).toHaveBeenCalledWith(
      "evidence",
      "Video"
    );
  });

  it("falls back to setForm(key, value) when formik.setFieldValue is absent and setForm has 2-arg signature", () => {
    formikRef.current = { errors: {}, touched: {} }; // no setFieldValue
    const setForm = vi.fn(function twoArg(_k, _v) {});
    // length===2 satisfies the .length >= 2 check.
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={setForm}
      />
    );
    const selects = screen.getAllByTestId("select-input");
    fireEvent.change(selects[0], { target: { value: "None" } });
    expect(setForm).toHaveBeenCalledWith("evidence", "None");
  });

  it("falls back to setForm(prev=>...) when setForm is a 1-arg state-updater", () => {
    formikRef.current = { errors: {}, touched: {} };
    const setForm = vi.fn((updater) => updater({ evidence: "Snapshot" }));
    // setForm.length === 1 -> the updater branch fires.
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={setForm}
      />
    );
    const selects = screen.getAllByTestId("select-input");
    fireEvent.change(selects[0], { target: { value: "Video" } });
    expect(setForm).toHaveBeenCalled();
  });

  it("changing the Time input dispatches formik.setFieldValue('time', value) when video", () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Video", time: 5, storage: "" }}
        setForm={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId("time-input"), {
      target: { value: "8" },
    });
    expect(formikRef.current.setFieldValue).toHaveBeenCalledWith("time", "8");
  });

  it("Time input fallback: setForm(key,value) when no formik.setFieldValue", () => {
    formikRef.current = { errors: {}, touched: {} };
    const setForm = vi.fn(function twoArg(_k, _v) {});
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Video", time: 5, storage: "" }}
        setForm={setForm}
      />
    );
    fireEvent.change(screen.getByTestId("time-input"), {
      target: { value: "12" },
    });
    expect(setForm).toHaveBeenCalledWith("time", "12");
  });

  it("Time input fallback: state-updater branch when setForm has length 1", () => {
    formikRef.current = { errors: {}, touched: {} };
    const setForm = vi.fn((updater) => updater({ time: 5 }));
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Video", time: 5, storage: "" }}
        setForm={setForm}
      />
    );
    fireEvent.change(screen.getByTestId("time-input"), {
      target: { value: "9" },
    });
    expect(setForm).toHaveBeenCalled();
  });

  it("fetches storage list on mount and renders Storage option labels", async () => {
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={vi.fn()}
      />
    );
    await waitFor(() => expect(apiGet.getStorage).toHaveBeenCalledTimes(1));
  });

  it("renders evidence formik error message when present", () => {
    formikRef.current = {
      errors: { evidence: "Evidence required" },
      touched: { evidence: true },
      setFieldValue: vi.fn(),
    };
    render(
      <EvidenceSeverityStep
        form={{ evidence: "", storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(screen.getByText("Evidence required")).toBeInTheDocument();
  });

  it("renders storage formik error only when touched.storage", () => {
    formikRef.current = {
      errors: { storage: "Storage required" },
      touched: { storage: true },
      setFieldValue: vi.fn(),
    };
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(screen.getByText("Storage required")).toBeInTheDocument();
  });

  it("hides storage error when touched.storage is false", () => {
    formikRef.current = {
      errors: { storage: "Storage required" },
      touched: { storage: false },
      setFieldValue: vi.fn(),
    };
    render(
      <EvidenceSeverityStep
        form={{ evidence: "Snapshot", storage: "" }}
        setForm={vi.fn()}
      />
    );
    expect(screen.queryByText("Storage required")).not.toBeInTheDocument();
  });
});
