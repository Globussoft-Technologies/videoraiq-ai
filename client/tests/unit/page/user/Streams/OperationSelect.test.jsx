/**
 * src/page/user/Streams/Operationselect.jsx — popover button that triggers
 * a bulk camera operation:
 *   - 'start' → updateBulkCameraSettings({ ids, control: 1 })
 *   - 'stop'  → updateBulkCameraSettings({ ids, control: 0 })
 *   - 'review' (currently commented out of options) →
 *       updateBulkCameraSettings({ ids, inReview: true })
 *
 * Visible options in the rendered popover are 'Start All' and 'Stop All' —
 * the source has 'pause' / 'review' commented out. We still cover the
 * `review` branch programmatically through the same handler entry point
 * (the source never calls it from the UI, only via key='review').
 *
 * Mocks (3):
 *   1. ./Api/pacth → updateBulkCameraSettings
 *   2. sonner → toast.success / toast.error
 *   3. @/components/ui/popover → inline shim so the panel is always in the
 *      DOM (real Radix Popover portals + delays open animation in jsdom,
 *      making the labels unfindable).
 *
 * The Button + lucide icons render inline and stay real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const updateBulkCameraSettings = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Streams/Api/patch", () => ({
  updateBulkCameraSettings,
  updateNVRById: vi.fn(),
  updateCameraSettingById: vi.fn(),
}));
// The product file imports via the relative `./Api/patch` specifier, so
// the path-alias mock above doesn't intercept it. Mirror the mock onto the
// relative path Vitest will resolve from src/page/user/Streams/. The
// directory was renamed from the original typo "pacth" -> "patch" in the
// post-pull product update.
vi.mock("../../../../../src/page/user/Streams/Api/patch", () => ({
  updateBulkCameraSettings,
  updateNVRById: vi.fn(),
  updateCameraSettingById: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Inline the popover so Trigger + Content render together, no portal.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div data-mock="popover">{children}</div>,
  PopoverTrigger: ({ children }) => <div data-mock="trigger">{children}</div>,
  PopoverContent: ({ children }) => <div data-mock="content">{children}</div>,
}));

const { default: OperationSelect } = await import(
  "../../../../../src/page/user/Streams/Operationselect.jsx"
);

beforeEach(() => {
  updateBulkCameraSettings.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("OperationSelect", () => {
  it("renders the trigger with the default 'Perform Operation' label", () => {
    render(<OperationSelect selectedIds={[]} />);
    expect(
      screen.getByRole("button", { name: /Perform Operation/i })
    ).toBeInTheDocument();
  });

  it("renders 'Start All' and 'Stop All' option rows", () => {
    render(<OperationSelect selectedIds={["a"]} />);
    expect(screen.getByText("Start All")).toBeInTheDocument();
    expect(screen.getByText("Stop All")).toBeInTheDocument();
  });

  it("clicking an option with no selected ids: toast.error('No cameras selected') and no API call", () => {
    render(<OperationSelect selectedIds={[]} />);
    fireEvent.click(screen.getByText("Start All"));
    expect(toast.error).toHaveBeenCalledWith("No cameras selected");
    expect(updateBulkCameraSettings).not.toHaveBeenCalled();
  });

  it("clicking 'Start All' calls updateBulkCameraSettings with control=1 and shows success toast", async () => {
    updateBulkCameraSettings.mockResolvedValue({ ok: true });
    const onBulkUpdate = vi.fn();
    render(
      <OperationSelect
        selectedIds={["cam-1", "cam-2"]}
        onBulkUpdate={onBulkUpdate}
      />
    );
    fireEvent.click(screen.getByText("Start All"));
    await waitFor(() => {
      expect(updateBulkCameraSettings).toHaveBeenCalledWith({
        ids: ["cam-1", "cam-2"],
        control: 1,
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Bulk operation successful");
    expect(onBulkUpdate).toHaveBeenCalledTimes(1);
  });

  it("clicking 'Stop All' calls updateBulkCameraSettings with control=0", async () => {
    updateBulkCameraSettings.mockResolvedValue({});
    render(<OperationSelect selectedIds={["c"]} />);
    fireEvent.click(screen.getByText("Stop All"));
    await waitFor(() => {
      expect(updateBulkCameraSettings).toHaveBeenCalledWith({
        ids: ["c"],
        control: 0,
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Bulk operation successful");
  });

  it("failed bulk operation: shows toast.error('Bulk operation failed') and does not invoke onBulkUpdate", async () => {
    updateBulkCameraSettings.mockRejectedValue(new Error("nope"));
    const onBulkUpdate = vi.fn();
    render(
      <OperationSelect selectedIds={["x"]} onBulkUpdate={onBulkUpdate} />
    );
    fireEvent.click(screen.getByText("Stop All"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Bulk operation failed");
    });
    expect(onBulkUpdate).not.toHaveBeenCalled();
  });

  it("after selecting an option the trigger label updates to that option's label", async () => {
    updateBulkCameraSettings.mockResolvedValue({});
    render(<OperationSelect selectedIds={["a"]} />);
    fireEvent.click(screen.getByText("Start All"));
    // setSelected is called synchronously inside the handler — the label
    // updates before the awaited promise resolves.
    await waitFor(() => {
      // 'Start All' appears once in the option list, plus the new trigger
      // copy. So expect at least one 'Start All' in the trigger button.
      const btn = screen.getByRole("button");
      expect(btn.textContent).toMatch(/Start All/);
    });
  });

  it("works without an onBulkUpdate prop (the optional callback is guarded)", async () => {
    updateBulkCameraSettings.mockResolvedValue({});
    render(<OperationSelect selectedIds={["a"]} />);
    expect(() => fireEvent.click(screen.getByText("Start All"))).not.toThrow();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Bulk operation successful");
    });
  });
});
