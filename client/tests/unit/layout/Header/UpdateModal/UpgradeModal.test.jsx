/**
 * src/layout/Header/UpdateModal/UpgradeModal.jsx — small portal-mounted
 * "Video not available — install/update the app" modal. The component is
 * self-contained:
 *   - internal `open` state (defaults to true on mount; the modal therefore
 *     renders immediately and the user can dismiss it).
 *   - internal `loading` state — set to true by handleConfirm for 1500ms,
 *     then cleared along with `open` (the confirm path closes the modal).
 *   - props: `confirmLabel` (string, default "Install") — when its value
 *     is "Upgrade" the right-hand button switches to the version-stamped
 *     "Upgrade" layout (CircleFadingArrowUp + "Version 1.61.14"); otherwise
 *     it renders the Download-icon variant with the supplied label.
 *   - rendered via ReactDOM.createPortal(document.body).
 *
 * Behaviour under test:
 *   1. Default render: portal is mounted on document.body, the dialog
 *      heading and helper copy are visible, both Dismiss and the
 *      default-label Install confirm button render. Dismiss closes the
 *      modal (the portal node disappears entirely).
 *   2. confirmLabel="Upgrade": the upgrade button renders the version
 *      label "Version 1.61.14" and the "Upgrade" caption (the Download
 *      variant is NOT in the DOM). Clicking the upgrade button sets
 *      loading=true synchronously (the Loader2 spinner appears and the
 *      button is disabled); after the 1500ms timer the modal closes.
 *
 * Mocks (0): the component pulls only lucide-react / react-icons / react-dom,
 * all safe to use directly in jsdom — no external context or asset deps.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import UpgradeModal from "@/layout/Header/UpdateModal/UpgradeModal.jsx";

describe("layout/Header/UpdateModal/UpgradeModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the dialog into document.body with default Install button and closes on Dismiss", () => {
    render(<UpgradeModal />);

    // Heading + helper copy
    expect(screen.getByText("Video not available")).toBeInTheDocument();
    expect(
      screen.getByText(/Install or update the app to view this feed\./i)
    ).toBeInTheDocument();

    // Default-label confirm button uses "Install"
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    const install = screen.getByRole("button", { name: /Install/ });
    expect(dismiss).toBeInTheDocument();
    expect(install).toBeInTheDocument();
    // Portal mounts the panel on body, not inside the test container
    expect(document.body.querySelector("div.fixed.inset-0")).toBeTruthy();

    // Dismiss tears the whole portal down
    fireEvent.click(dismiss);
    expect(screen.queryByText("Video not available")).toBeNull();
    expect(document.body.querySelector("div.fixed.inset-0")).toBeNull();
  });

  it("with confirmLabel='Upgrade' shows the version-stamped upgrade button, sets loading on confirm, then closes after 1500ms", () => {
    render(<UpgradeModal confirmLabel="Upgrade" />);

    // Upgrade branch renders the version stamp and Upgrade caption
    expect(screen.getByText("Version 1.61.14")).toBeInTheDocument();
    const upgradeCaption = screen.getByText("Upgrade");
    expect(upgradeCaption).toBeInTheDocument();
    // The Install branch should NOT be in the DOM at the same time
    expect(screen.queryByRole("button", { name: /^Install$/ })).toBeNull();

    // The Upgrade button is the element containing the "Upgrade" caption
    const upgradeBtn = upgradeCaption.closest("button");
    expect(upgradeBtn).toBeTruthy();
    expect(upgradeBtn.disabled).toBe(false);

    // Click confirm -> loading goes true synchronously: spinner appears,
    // the caption text is removed from the button, and it becomes disabled.
    fireEvent.click(upgradeBtn);
    expect(upgradeBtn.disabled).toBe(true);
    expect(upgradeBtn.querySelector("svg.animate-spin")).toBeTruthy();
    expect(screen.queryByText("Version 1.61.14")).toBeNull();

    // After the 1500ms timer the modal closes entirely (portal removed).
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText("Video not available")).toBeNull();
    expect(document.body.querySelector("div.fixed.inset-0")).toBeNull();
  });
});
