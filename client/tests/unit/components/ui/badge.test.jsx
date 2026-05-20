/**
 * Badge is a CVA-driven span (or Slot when asChild). Cover variants,
 * className merging, asChild rendering, and children pass-through.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "../../../../src/components/ui/badge.jsx";

describe("ui/Badge", () => {
  it("renders a span with the children", () => {
    render(<Badge>Hot</Badge>);
    const el = screen.getByText("Hot");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("data-slot", "badge");
  });

  it("applies the default variant class", () => {
    render(<Badge>x</Badge>);
    expect(screen.getByText("x")).toHaveClass("bg-primary");
  });

  it("applies the destructive variant class", () => {
    render(<Badge variant="destructive">x</Badge>);
    expect(screen.getByText("x")).toHaveClass("bg-destructive");
  });

  it("applies the secondary variant class", () => {
    render(<Badge variant="secondary">x</Badge>);
    expect(screen.getByText("x")).toHaveClass("bg-secondary");
  });

  it("applies the outline variant (text-foreground)", () => {
    render(<Badge variant="outline">x</Badge>);
    expect(screen.getByText("x")).toHaveClass("text-foreground");
  });

  it("merges custom className", () => {
    render(<Badge className="custom-b">x</Badge>);
    expect(screen.getByText("x")).toHaveClass("custom-b");
  });

  it("renders as the child element when asChild", () => {
    render(
      <Badge asChild>
        <a href="/y">link</a>
      </Badge>
    );
    const link = screen.getByRole("link", { name: "link" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/y");
    expect(link).toHaveAttribute("data-slot", "badge");
  });

  it("exposes a badgeVariants helper", () => {
    expect(typeof badgeVariants({ variant: "destructive" })).toBe("string");
    expect(badgeVariants({ variant: "destructive" })).toMatch(/bg-destructive/);
  });
});
