/**
 * src/components/ui/dialog.jsx — thin wrappers around @radix-ui/react-dialog.
 * Mock the primitives so we can exercise every exported wrapper inline.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@radix-ui/react-dialog", () => {
  const make = (name) => ({ children, ...rest }) =>
    React.createElement("div", { "data-mock-name": name, ...rest }, children);
  return {
    Root: make("Root"),
    Trigger: make("Trigger"),
    Portal: ({ children }) => <>{children}</>,
    Close: make("Close"),
    Overlay: make("Overlay"),
    Content: make("Content"),
    Title: make("Title"),
    Description: make("Description"),
  };
});

const Mod = await import("../../../../src/components/ui/dialog.jsx");

const {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogOverlay,
  DialogPortal,
} = Mod;

describe("ui/dialog wrappers", () => {
  it("Dialog passes children to Root", () => {
    render(
      <Dialog>
        <span>root-child</span>
      </Dialog>
    );
    expect(screen.getByText("root-child")).toBeInTheDocument();
  });

  it("DialogTrigger / DialogClose / DialogOverlay / DialogPortal carry data-slots", () => {
    const { container } = render(
      <>
        <DialogTrigger>t</DialogTrigger>
        <DialogClose>c</DialogClose>
        <DialogOverlay />
        <DialogPortal>
          <span>p</span>
        </DialogPortal>
      </>
    );
    expect(container.querySelector('[data-slot="dialog-trigger"]').textContent).toBe("t");
    expect(container.querySelector('[data-slot="dialog-close"]').textContent).toBe("c");
    expect(container.querySelector('[data-slot="dialog-overlay"]')).not.toBeNull();
    expect(container.textContent).toContain("p");
  });

  it("DialogContent renders the overlay, children and an X close button", () => {
    const { container } = render(<DialogContent>hello</DialogContent>);
    // Children rendered
    expect(container.textContent).toContain("hello");
    // Overlay is part of content
    expect(container.querySelector('[data-slot="dialog-overlay"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    // X svg close icon and sr-only "Close" label
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Close");
  });

  it("DialogContent passes a custom closeBtn class onto the close button", () => {
    const { container } = render(
      <DialogContent closeBtn="custom-close-class">x</DialogContent>
    );
    const closeBtn = container.querySelector(".custom-close-class");
    expect(closeBtn).not.toBeNull();
  });

  it("DialogHeader and DialogFooter render with their data-slots", () => {
    const { container } = render(
      <>
        <DialogHeader>head</DialogHeader>
        <DialogFooter>foot</DialogFooter>
      </>
    );
    expect(container.querySelector('[data-slot="dialog-header"]').textContent).toBe("head");
    expect(container.querySelector('[data-slot="dialog-footer"]').textContent).toBe("foot");
  });

  it("DialogTitle and DialogDescription render with their data-slots", () => {
    const { container } = render(
      <>
        <DialogTitle>title</DialogTitle>
        <DialogDescription>desc</DialogDescription>
      </>
    );
    expect(container.querySelector('[data-slot="dialog-title"]').textContent).toBe("title");
    expect(container.querySelector('[data-slot="dialog-description"]').textContent).toBe(
      "desc"
    );
  });
});
