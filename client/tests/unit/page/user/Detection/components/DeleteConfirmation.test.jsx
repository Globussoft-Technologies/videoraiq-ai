/**
 * src/page/user/Detection/components/DeleteConfirmation.jsx — pure presentational
 * confirmation modal rendered through ReactDOM.createPortal. No external deps
 * beyond lucide icons.
 *
 * Mocks: 0
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmationModal from "@/page/user/Detection/components/DeleteConfirmation.jsx";

describe("ConfirmationModal (Detection/DeleteConfirmation)", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <ConfirmationModal open={false} message="m" onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Confirm Delete")).toBeNull();
  });

  it("renders default title, message, warning banner, and default labels when open", () => {
    render(
      <ConfirmationModal
        open
        message="Delete this item?"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
    expect(screen.getByText("Delete this item?")).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders icon node only when provided", () => {
    const { rerender } = render(
      <ConfirmationModal open message="m" onClose={() => {}} onConfirm={() => {}} />
    );
    expect(document.querySelector("[data-testid='custom-icon']")).toBeNull();
    rerender(
      <ConfirmationModal
        open
        message="m"
        icon={<span data-testid="custom-icon">ico</span>}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("uses custom title, confirmLabel and cancelLabel when supplied", () => {
    render(
      <ConfirmationModal
        open
        title="Really?"
        confirmLabel="Yes, delete"
        cancelLabel="Nope"
        message="x"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText("Really?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nope" })).toBeInTheDocument();
  });

  it("invokes onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal open message="m" onClose={onClose} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("invokes onConfirm when the confirm button is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal open message="m" onClose={onClose} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables confirm button and renders spinner when loading", () => {
    render(
      <ConfirmationModal
        open
        message="m"
        loading
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: /^$/ }) ||
      Array.from(document.querySelectorAll("button")).find((b) => b.disabled);
    // Find disabled button — the confirm one
    const disabled = Array.from(document.querySelectorAll("button")).find((b) => b.disabled);
    expect(disabled).toBeTruthy();
    expect(disabled.querySelector("svg")).toBeTruthy();
  });

  it("renders message as a ReactNode (not just string)", () => {
    render(
      <ConfirmationModal
        open
        message={<span data-testid="rich">are you sure?</span>}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId("rich")).toBeInTheDocument();
  });
});
