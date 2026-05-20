/**
 * Button is a CVA-driven wrapper that supports `asChild` via Radix Slot.
 * We assert variant classes are applied, the asChild branch renders the
 * child element (not a button), and click events propagate.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, buttonVariants } from "../../../../src/components/ui/button.jsx";

describe("ui/Button", () => {
  it("renders a <button> by default", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button", { name: "Click" }).tagName).toBe("BUTTON");
  });

  it("applies the default variant class", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary");
  });

  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-destructive");
  });

  it("applies the outline variant class", () => {
    render(<Button variant="outline">X</Button>);
    expect(screen.getByRole("button").className).toMatch(/border/);
  });

  it("applies size classes", () => {
    render(<Button size="lg">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-10");
  });

  it("merges a user-provided className", () => {
    render(<Button className="my-extra">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("my-extra");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>X</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respects disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        X
      </Button>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders as the child element when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/x">link</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "link" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/x");
  });

  it("exposes a buttonVariants helper that returns a class string", () => {
    const cls = buttonVariants({ variant: "secondary", size: "sm" });
    expect(typeof cls).toBe("string");
    expect(cls).toMatch(/bg-secondary/);
  });
});
