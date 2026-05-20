/**
 * The Tabs primitives are thin wrappers around @radix-ui/react-tabs. None
 * of them render into a Portal, so they're safe to test in jsdom.
 * Cover: default selection, switching to another tab via click, data-slot
 * attributes on each part, and className merging on the root.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../../../src/components/ui/tabs.jsx";

function setup(defaultValue = "a") {
  return render(
    <Tabs defaultValue={defaultValue} className="my-tabs">
      <TabsList className="my-list">
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">A panel</TabsContent>
      <TabsContent value="b">B panel</TabsContent>
    </Tabs>
  );
}

describe("ui/Tabs primitives", () => {
  it("renders the trigger labels and the default panel", () => {
    setup();
    expect(screen.getByRole("tab", { name: "Tab A" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab B" })).toBeInTheDocument();
    expect(screen.getByText("A panel")).toBeInTheDocument();
  });

  it("marks the default trigger as active", () => {
    setup();
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "data-state",
      "inactive"
    );
  });

  it("respects a different defaultValue", () => {
    setup("b");
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("B panel")).toBeInTheDocument();
  });

  it("switches the active panel when another tab is activated", () => {
    setup();
    // Radix Tabs activates on pointerDown — fire that to avoid the
    // jsdom click-doesn't-focus problem.
    const tabB = screen.getByRole("tab", { name: "Tab B" });
    fireEvent.pointerDown(tabB, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(tabB, { button: 0, ctrlKey: false });
    fireEvent.click(tabB);
    expect(tabB).toHaveAttribute("data-state", "active");
    expect(screen.getByText("B panel")).toBeInTheDocument();
  });

  it("annotates parts with the expected data-slot attributes", () => {
    setup();
    expect(document.querySelector('[data-slot="tabs"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="tabs-list"]')).not.toBeNull();
    expect(
      document.querySelectorAll('[data-slot="tabs-trigger"]').length
    ).toBe(2);
    // Only the active panel renders by default in Radix
    expect(
      document.querySelectorAll('[data-slot="tabs-content"]').length
    ).toBeGreaterThanOrEqual(1);
  });

  it("merges custom classNames onto Tabs and TabsList roots", () => {
    setup();
    expect(document.querySelector('[data-slot="tabs"]').className).toContain(
      "my-tabs"
    );
    expect(document.querySelector('[data-slot="tabs-list"]').className).toContain(
      "my-list"
    );
  });
});
