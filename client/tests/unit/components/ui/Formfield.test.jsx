/**
 * FormField wraps an Input with a label and an optional alert icon.
 * Verify label association, readOnly logic (no onChange => readOnly),
 * alert-icon visibility, and that onChange is propagated.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FormField from "../../../../src/components/ui/Formfield.jsx";

describe("ui/FormField", () => {
  it("renders the label text", () => {
    render(<FormField label="Email" id="email" type="email" value="" />);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders an input with the supplied id and type", () => {
    render(<FormField label="Email" id="email" type="email" value="" />);
    const input = screen.getByLabelText("Email");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveAttribute("type", "email");
  });

  it("makes the input readOnly when onChange is not provided", () => {
    render(<FormField label="Name" id="name" type="text" value="Jane" />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("readonly");
  });

  it("is editable when onChange is provided and forwards change events", () => {
    const fn = vi.fn();
    render(
      <FormField label="Name" id="name" type="text" value="" onChange={fn} />
    );
    const input = screen.getByLabelText("Name");
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.change(input, { target: { value: "Bob" } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not show the alert icon by default", () => {
    const { container } = render(
      <FormField label="Name" id="name" type="text" value="" />
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the alert icon when showAlert is true", () => {
    const { container } = render(
      <FormField label="Name" id="name" type="text" value="" showAlert />
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("reflects the value prop in the rendered input", () => {
    render(
      <FormField
        label="Name"
        id="name"
        type="text"
        value="Alice"
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Alice");
  });
});
