/**
 * RadioOption is a reusable label + radio item card. Test it inside a
 * RadioGroup (Radix root, no Portal) to verify:
 *   - the title / description / icon (img) render
 *   - the label is correctly associated with the underlying radio via id
 *   - clicking the option selects it (data-state="checked")
 *   - clicking a second option changes the selection
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RadioGroup } from "../../../../src/components/ui/radio-group.jsx";
import RadioOption from "../../../../src/components/ui/RaidoOption.jsx";

function setup({ onValueChange = () => {} } = {}) {
  return render(
    <RadioGroup onValueChange={onValueChange}>
      <RadioOption
        value="cat"
        title="Cat"
        description="A small carnivorous mammal"
        img={<span data-testid="img-cat">🐱</span>}
        className="custom-card"
      />
      <RadioOption
        value="dog"
        title="Dog"
        description="A loyal companion"
        img={<span data-testid="img-dog">🐶</span>}
      />
    </RadioGroup>
  );
}

describe("ui/RadioOption", () => {
  it("renders the title and description text", () => {
    setup();
    expect(screen.getByText("Cat")).toBeInTheDocument();
    expect(screen.getByText("A small carnivorous mammal")).toBeInTheDocument();
    expect(screen.getByText("Dog")).toBeInTheDocument();
    expect(screen.getByText("A loyal companion")).toBeInTheDocument();
  });

  it("renders the icon node alongside each title", () => {
    setup();
    expect(screen.getByTestId("img-cat")).toBeInTheDocument();
    expect(screen.getByTestId("img-dog")).toBeInTheDocument();
  });

  it("associates the label with the radio item via id=value", () => {
    setup();
    // The Radix radio item is a button with role="radio".
    const buttons = screen.getAllByRole("radio");
    expect(buttons.length).toBe(2);
    expect(buttons[0]).toHaveAttribute("id", "cat");
    expect(buttons[1]).toHaveAttribute("id", "dog");
  });

  it("applies the merged custom className on the card wrapper", () => {
    const { container } = setup();
    expect(container.querySelector(".custom-card")).not.toBeNull();
  });

  it("selects an option when clicked and notifies onValueChange", () => {
    const onValueChange = vi.fn();
    setup({ onValueChange });
    const [catBtn] = screen.getAllByRole("radio");
    fireEvent.click(catBtn);
    expect(onValueChange).toHaveBeenCalledWith("cat");
    expect(catBtn).toHaveAttribute("data-state", "checked");
  });

  it("switches selection when a different option is clicked", () => {
    const onValueChange = vi.fn();
    setup({ onValueChange });
    const [catBtn, dogBtn] = screen.getAllByRole("radio");
    fireEvent.click(catBtn);
    fireEvent.click(dogBtn);
    expect(onValueChange).toHaveBeenLastCalledWith("dog");
    expect(dogBtn).toHaveAttribute("data-state", "checked");
    expect(catBtn).toHaveAttribute("data-state", "unchecked");
  });
});
