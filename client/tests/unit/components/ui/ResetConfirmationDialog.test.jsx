/**
 * ResetConfirmationDialog renders inside a Radix Dialog which uses Portals.
 * Mock @/components/ui/dialog so the content renders inline and we can assert
 * the title/message and Cancel/Reset button behaviour.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }) => (open ? <div data-slot="dialog">{children}</div> : null);
  const DialogContent = ({ children }) => <div data-slot="dialog-content">{children}</div>;
  const DialogTitle = ({ children, ...rest }) => <h2 {...rest}>{children}</h2>;
  return { Dialog, DialogContent, DialogTitle };
});

const ResetConfirmationDialog = (
  await import("../../../../src/components/ui/ResetConfirmationDialog.jsx")
).default;

describe("ResetConfirmationDialog", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <ResetConfirmationDialog open={false} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.querySelector('[data-slot="dialog"]')).toBeNull();
  });

  it("renders default title and message when open=true", () => {
    render(<ResetConfirmationDialog open={true} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Reset Confirmation")).toBeInTheDocument();
    expect(
      screen.getByText(/This action cannot be undone\./i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset Anyway/i })).toBeInTheDocument();
  });

  it("uses custom title and message props", () => {
    render(
      <ResetConfirmationDialog
        open={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Custom Reset?"
        message="Definitely no take-backs."
      />
    );
    expect(screen.getByText("Custom Reset?")).toBeInTheDocument();
    expect(screen.getByText("Definitely no take-backs.")).toBeInTheDocument();
  });

  it("invokes onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<ResetConfirmationDialog open={true} onClose={onClose} onConfirm={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onConfirm when Reset Anyway is clicked", () => {
    const onConfirm = vi.fn();
    render(<ResetConfirmationDialog open={true} onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /Reset Anyway/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
