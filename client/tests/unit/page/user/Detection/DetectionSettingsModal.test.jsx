/**
 * src/page/user/Detection/DetectionSettingsModal.jsx — Dialog wrapper that
 * embeds SavedConfiguration (with Action='action') + AddNewConfiguration
 * inside a fixed "Detection Settings" header. Renders nothing when the
 * dialog is closed.
 *
 * Mocks (3):
 *   1. @/components/ui/dialog — Radix portal makes content invisible in
 *      jsdom; inline shim that respects the `open` prop.
 *   2. ./components/SavedConfiguration — capture the Action prop.
 *   3. ./components/AddNewConfiguration — replace with marker div.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children, onOpenChange }) =>
    open ? (
      <div data-slot="dialog" data-on-change={onOpenChange ? "yes" : "no"}>
        {children}
      </div>
    ) : null;
  const DialogContent = ({
    children,
    closeBtn: _c,
    onPointerDownOutside: _p,
    ...rest
  }) => (
    <div data-slot="dialog-content" {...rest}>
      {children}
    </div>
  );
  return { Dialog, DialogContent };
});

vi.mock(
  "../../../../../src/page/user/Detection/components/SavedConfiguration",
  () => ({
    default: ({ Action }) => (
      <div data-testid="saved" data-action={Action ?? ""}>
        saved
      </div>
    ),
  })
);

vi.mock(
  "../../../../../src/page/user/Detection/components/AddNewConfiguration",
  () => ({
    default: () => <div data-testid="add-new">add new</div>,
  })
);

const { default: DetectionSettingsModal } = await import(
  "../../../../../src/page/user/Detection/DetectionSettingsModal.jsx"
);

describe("DetectionSettingsModal", () => {
  it("renders nothing when isOpen=false", () => {
    const { container } = render(
      <DetectionSettingsModal isOpen={false} onClose={() => {}} />
    );
    expect(container.querySelector("[data-slot='dialog']")).toBeNull();
    expect(screen.queryByTestId("saved")).toBeNull();
    expect(screen.queryByTestId("add-new")).toBeNull();
  });

  it("renders the dialog with header and both children when open", () => {
    render(<DetectionSettingsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Detection Settings")).toBeInTheDocument();
    expect(screen.getByTestId("saved")).toBeInTheDocument();
    expect(screen.getByTestId("add-new")).toBeInTheDocument();
  });

  it("forwards Action='action' to SavedConfiguration", () => {
    render(<DetectionSettingsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByTestId("saved").getAttribute("data-action")).toBe(
      "action"
    );
  });

  it("clicking the X close button invokes onClose", () => {
    const onClose = vi.fn();
    render(<DetectionSettingsModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("attaches onOpenChange to the Dialog (so Radix's outside-close path is wired)", () => {
    render(<DetectionSettingsModal isOpen={true} onClose={() => {}} />);
    expect(
      screen.getByRole("button").closest("[data-slot='dialog']")
        ?.getAttribute("data-on-change")
    ).toBe("yes");
  });
});
