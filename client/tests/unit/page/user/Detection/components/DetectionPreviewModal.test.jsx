/**
 * src/page/user/Detection/components/DetectionPreviewModal.jsx — small
 * Radix Dialog wrapper. Two close affordances (close button + footer
 * close button), and children are projected into the body. Mocks: 0.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DetectionPreviewModal from "../../../../../../src/page/user/Detection/components/DetectionPreviewModal.jsx";

describe("DetectionPreviewModal", () => {
  it("does not render content while closed", () => {
    render(
      <DetectionPreviewModal isOpen={false} onClose={() => {}}>
        <div>hello-preview</div>
      </DetectionPreviewModal>
    );
    expect(screen.queryByText("hello-preview")).not.toBeInTheDocument();
  });

  it("renders the heading, children, and footer close button when open", () => {
    render(
      <DetectionPreviewModal isOpen={true} onClose={() => {}}>
        <div>injected-child</div>
      </DetectionPreviewModal>
    );
    expect(screen.getByText("preview area settings")).toBeInTheDocument();
    expect(screen.getByText("injected-child")).toBeInTheDocument();
    // There are multiple "Close" labels (Radix sr-only + footer button).
    const closeMatches = screen.getAllByText("Close");
    expect(closeMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when the footer Close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <DetectionPreviewModal isOpen={true} onClose={onClose}>
        <span>x</span>
      </DetectionPreviewModal>
    );
    // Footer button is the only one with the bg-[#07486A] visible style.
    const footerBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Close" && b.className.includes("bg-[#07486A]")
    );
    expect(footerBtn).toBeTruthy();
    fireEvent.click(footerBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the explicit top-right X icon button is clicked", () => {
    const onClose = vi.fn();
    render(
      <DetectionPreviewModal isOpen={true} onClose={onClose}>
        <span>x</span>
      </DetectionPreviewModal>
    );
    // Find the X-icon close button by its lucide-x svg child.
    const xBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.querySelector("svg.lucide-x")
    );
    expect(xBtn).toBeTruthy();
    fireEvent.click(xBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
